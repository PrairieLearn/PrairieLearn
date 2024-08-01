import csv
import hashlib
import itertools
import json
import re
from io import StringIO

import chevron
import lxml.html
import prairielearn as pl
from colors import PLColor

ALLOW_BLANK_DEFAULT = False


# Convert a comma-separated list of file names into an array
def get_file_names_as_array(raw_file_names: str) -> list[str]:
    if not raw_file_names:
        return []

    reader = csv.reader(
        StringIO(raw_file_names),
        delimiter=",",
        escapechar="\\",
        quoting=csv.QUOTE_NONE,
        skipinitialspace=True,
        strict=True,
    )
    return next(reader)


# Split optional file names into two categories: wildcard patterns and plain file names
# For the wildcards, convert into regular expressions and return a two-item list with both the regex and a plain display version
# For the plain names, remove escapes for displaying and return in a separate list
def extract_patterns(optional_file: str) -> tuple[list[list[str]], list[str]]:
    # Try converting all file names to regexes; if no wildcard is present, glob_to_regex returns an empty string
    optional_file_regex_raw = [glob_to_regex(x) for x in optional_file]

    # Collect and remove escapes from where the regular expression is empty, so that these cases can be handled by string comparison
    optional_file_plain = [
        name.replace("\\", "")
        for regex, name in zip(optional_file_regex_raw, optional_file)
        if not regex
    ]

    # Collect that actual regular expressions and add the plain name for displaying
    optional_file_regex = [
        [regex, name]
        for regex, name in zip(optional_file_regex_raw, optional_file)
        if regex
    ]
    return optional_file_regex, optional_file_plain


# Translate glob into regex patterns for consistent handling in Python and JS
# Returns the regex if wildcards are present and an empty string otherwise
def glob_to_regex(glob_pattern: str) -> str:
    result = "^"
    has_wildcard = False
    escape = False
    in_range = False
    for c in glob_pattern:
        if escape:
            result += re.escape(c)
            escape = False
        elif in_range and c != "]":
            result += c
        elif c == "\\":
            escape = True
        elif c == "?":
            has_wildcard = True
            result += "."
        elif c == "*":
            has_wildcard = True
            result += ".*"
        elif c == "[":
            has_wildcard = True
            in_range = True
            result += c
        elif c == "]":
            in_range = False
            result += c
        else:
            result += re.escape(c)

    # If there are no wildcards, return an empty string
    if not has_wildcard:
        return ""

    result += "$"
    return result


# Each pl-file-upload element is uniquely identified by the SHA1 hash of its
# file-names and optional-file-names attributes
def get_answer_name(file_names: str, optional_file_names: str = "") -> str:
    return "_file_upload_{0}".format(
        # Using / as separator as the only character guaranteed not to appear in file names
        hashlib.sha1(
            "/".join([file_names, optional_file_names]).encode("utf-8")
        ).hexdigest()
    )


def add_format_error(data: pl.QuestionData, error_string: str) -> None:
    if "_files" not in data["format_errors"]:
        data["format_errors"]["_files"] = []
    data["format_errors"]["_files"].append(error_string)


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)

    # Either "file-names" or "optional-file-names" is required, which is checked separately
    required_attribs = []
    optional_attribs = ["file-names", "optional-file-names", "allow-blank"]
    pl.check_attribs(element, required_attribs, optional_attribs)
    if not pl.has_attrib(element, "file-names") and not pl.has_attrib(
        element, "optional-file-names"
    ):
        raise Exception(
            "One of required attributes file-names or optional-file-names missing"
        )

    if "_required_file_names" not in data["params"]:
        data["params"]["_required_file_names"] = []

    required_file_names = get_file_names_as_array(
        pl.get_string_attrib(element, "file-names", "")
    )
    data["params"]["_required_file_names"].extend(required_file_names)


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    uuid = pl.get_uuid()
    parse_error = data["format_errors"].get("_files", None)

    if data["panel"] != "question":
        return ""

    raw_file_names = pl.get_string_attrib(element, "file-names", "")
    file_names = sorted(get_file_names_as_array(raw_file_names))
    file_names_json = json.dumps(file_names, allow_nan=False)

    raw_optional_file_names = pl.get_string_attrib(element, "optional-file-names", "")
    optional_file_names = sorted(get_file_names_as_array(raw_optional_file_names))

    # Split optional names into two separate lists: wildcard patterns and plain names
    optional_file_regex, optional_file_plain = extract_patterns(optional_file_names)

    optional_file_plain_json = json.dumps(optional_file_plain, allow_nan=False)
    optional_file_regex_json = json.dumps(optional_file_regex, allow_nan=False)

    answer_name = get_answer_name(raw_file_names, raw_optional_file_names)

    # Only send the file names to the client. We don't include the contents
    # to avoid bloating the HTML. The client will fetch any submitted files
    # asynchronously once the page loads
    submitted_files = data["submitted_answers"].get("_files", [])
    submitted_file_names = [x.get("name") for x in submitted_files]

    # We filter out any files that neither match a required file name or plain optional name
    required_files = set(submitted_file_names) & set(file_names)
    optional_files = set(submitted_file_names) & set(optional_file_plain)

    # For wildcard patterns, we have to do a more complex pairwise matching of files and patterns
    wildcard_files = {
        file
        for pattern, file in itertools.product(
            optional_file_regex, submitted_file_names
        )
        if re.compile(pattern[0], re.IGNORECASE).match(file)
    }
    accepted_file_names = list(required_files | optional_files | wildcard_files)

    submitted_file_names_json = json.dumps(accepted_file_names, allow_nan=False)

    html_params = {
        "question": True,
        "name": answer_name,
        "file_names": file_names_json,
        "optional_file_names": optional_file_plain_json,
        "optional_file_regex": optional_file_regex_json,
        "uuid": uuid,
        "editable": data["editable"],
        "submission_files_url": data["options"].get("submission_files_url", None),
        "submitted_file_names": submitted_file_names_json,
        "check_icon_color": PLColor("correct_green"),
        "parse_error": parse_error,
    }

    with open("pl-file-upload.mustache", "r", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    raw_required_file_names = pl.get_string_attrib(element, "file-names", "")
    required_file_names = get_file_names_as_array(raw_required_file_names)
    raw_optional_file_names = pl.get_string_attrib(element, "optional-file-names", "")
    optional_file_names = get_file_names_as_array(raw_optional_file_names)
    answer_name = get_answer_name(raw_required_file_names, raw_optional_file_names)

    # Get submitted answer or return format error if it does not exist
    files = data["submitted_answers"].get(answer_name, None)
    if not files and not allow_blank:
        add_format_error(data, "No submitted answer for file upload.")
        return

    # We will store the files in the submitted_answer["_files"] key,
    # so delete the original submitted answer format to avoid duplication
    del data["submitted_answers"][answer_name]

    try:
        parsed_files = json.loads(files)
    except Exception:
        add_format_error(data, "Could not parse submitted files.")
        parsed_files = []

    # Split optional names into two separate lists: wildcard patterns and plain names
    optional_file_regex, optional_file_plain = extract_patterns(optional_file_names)

    # Pair up patterns and files and retain only files where at least one pattern matches
    wildcard_files = {
        file.get("name", "")
        for pattern, file in itertools.product(optional_file_regex, parsed_files)
        if re.compile(pattern[0], re.IGNORECASE).match(file.get("name", ""))
    }

    parsed_files = [
        x
        for x in parsed_files
        if x.get("name", "") in required_file_names
        or x.get("name", "") in optional_file_plain
        or x.get("name", "") in wildcard_files
    ]

    # Return format error if cleaned file list is empty and allow_blank is not set
    if not parsed_files and not allow_blank:
        add_format_error(data, "No submitted answer for file upload.")

    if data["submitted_answers"].get("_files", None) is None:
        data["submitted_answers"]["_files"] = parsed_files
    elif isinstance(data["submitted_answers"].get("_files", None), list):
        data["submitted_answers"]["_files"].extend(parsed_files)
    else:
        add_format_error(data, "_files was present but was not an array.")

    # Validate that all required files are present
    if parsed_files is not None:
        submitted_file_names = [x.get("name", "") for x in parsed_files]
        missing_files = [
            x for x in required_file_names if x not in submitted_file_names
        ]

        if len(missing_files) > 0:
            add_format_error(
                data,
                "The following required files were missing: "
                + ", ".join(missing_files),
            )
