import csv
import hashlib
import json
import re
from io import StringIO

import chevron
import lxml.html
import prairielearn as pl
from colors import PLColor

ALLOW_BLANK_DEFAULT = False


def get_file_names_as_array(raw_file_names: str) -> list[str]:
    """
    Converts a comma-separated list of file names into an array
    """
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


def find_matching_files(
    regex_patterns: list[list[str]], files_names: list[str]
) -> set[str]:
    """
    Takes a list of regexes (as returned by extract_patterns) and a list of file names and
    returns the set of file names that match any of the given patterns.
    """
    result = set()
    for pattern in regex_patterns:
        regex = re.compile(pattern[0], re.IGNORECASE)
        for file in files_names:
            if regex.match(file):
                result.add(file)

    return result


def extract_patterns(optional_files: list[str]) -> tuple[list[list[str]], list[str]]:
    """
    Takes a list of file names and returns it split into wildcard patterns and plain names

    File names with with wildcards are converted into regular expressions and returned as a
    list of two-item lists, each containing both the regex for matching and the plain pattern
    for display. Plain file names are returned in a list with escapes removed for simple
    string-based comparison
    """
    optional_files_plain = []
    optional_files_regex = []

    for file in optional_files:
        # glob_to_regex returns an empty string if the file name contains no wildcard
        regex_raw = glob_to_regex(file)
        if regex_raw:
            optional_files_regex.append([regex_raw, file])
        else:
            optional_files_plain.append(file.replace("\\", ""))

    return optional_files_regex, optional_files_plain


def glob_to_regex(glob_pattern: str) -> str:
    """
    Translates a glob pattern into a regex that can be handled consistently across Python and JS
    Returns the regex if wildcards are present, and an empty string otherwise
    """
    result = ["^"]
    has_wildcard = False
    escape = False
    in_range = False
    for c in glob_pattern:
        if escape:
            result.append(re.escape(c))
            escape = False
        elif in_range and c != "]":
            result.append(c)
        elif c == "\\":
            escape = True
        elif c == "?":
            has_wildcard = True
            result.append(".")
        elif c == "*":
            has_wildcard = True
            result.append(".*")
        elif c == "[":
            has_wildcard = True
            in_range = True
            result.append(c)
        elif c == "]":
            in_range = False
            result.append(c)
        else:
            result.append(re.escape(c))

    # If there are no wildcards, return an empty string
    if not has_wildcard:
        return ""

    result.append("$")
    return "".join(result)


def get_answer_name(file_names: str, optional_file_names: str = "") -> str:
    """
    Computes the unique identifer of a pl-file-upload element, which is the SHA1 hash of its
    file-names and optional-file-names attributes
    """
    return "_file_upload_{0}".format(
        # Using / as separator as the only character guaranteed not to appear in file names
        hashlib.sha1(
            "/".join([file_names, optional_file_names]).encode("utf-8")
        ).hexdigest()
    )


def add_format_error(
    answer_name: str, data: pl.QuestionData, error_string: str
) -> None:
    # Adding format errors to both answer_name and "_files" keys for display next to this
    # element and in submissions
    pl.add_files_format_error(data, error_string)

    if answer_name not in data["format_errors"]:
        data["format_errors"][answer_name] = []
    data["format_errors"][answer_name].append(error_string)


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)

    # Either "file-names" or "optional-file-names" is required, which is checked separately
    required_attribs = []
    optional_attribs = ["file-names", "optional-file-names", "allow-blank"]
    pl.check_attribs(element, required_attribs, optional_attribs)
    if not pl.get_string_attrib(element, "file-names", "") and not pl.get_string_attrib(
        element, "optional-file-names", ""
    ):
        raise ValueError(
            'One of the required attributes "file-names" or "optional-file-names" is missing'
        )

    if pl.get_string_attrib(element, "file-names", "") and pl.get_boolean_attrib(
        element, "allow-blank", ALLOW_BLANK_DEFAULT
    ):
        raise ValueError(
            'The attribute "allow-blank" cannot be used when (mandatory) "file-names" are specified'
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
    parse_error = data["format_errors"].get(answer_name, [])

    # Only send the file names to the client. We don't include the contents
    # to avoid bloating the HTML. The client will fetch any submitted files
    # asynchronously once the page loads
    submitted_files = data["submitted_answers"].get("_files", [])
    submitted_file_names = [x.get("name") for x in submitted_files]

    # We find any files that match a required file name, an optional one, or a wildcard pattern
    required_files = set(submitted_file_names) & set(file_names)
    optional_files = set(submitted_file_names) & set(optional_file_plain)
    wildcard_files = find_matching_files(optional_file_regex, submitted_file_names)

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
        "submission_files_url": data["options"].get("submission_files_url"),
        "submitted_file_names": submitted_file_names_json,
        "check_icon_color": PLColor("correct_green"),
        "parse_error": "<br>".join(parse_error),
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
    files = data["submitted_answers"].get(answer_name)
    if not files and not allow_blank:
        add_format_error(answer_name, data, "No submitted answer for file upload.")
        return

    # We will store the files in the submitted_answer["_files"] key,
    # so delete the original submitted answer format to avoid duplication
    del data["submitted_answers"][answer_name]

    try:
        parsed_files = json.loads(files)  # pyright: ignore [reportArgumentType]
    except Exception:
        add_format_error(answer_name, data, "Could not parse submitted files.")
        parsed_files = []

    # Split optional names into two separate lists: wildcard patterns and plain names
    optional_files_regex, optional_files_plain = extract_patterns(optional_file_names)

    wildcard_files = find_matching_files(
        optional_files_regex, [x.get("name", "") for x in parsed_files]
    )

    parsed_files = [
        x
        for x in parsed_files
        if x.get("name", "") in required_file_names
        or x.get("name", "") in optional_files_plain
        or x.get("name", "") in wildcard_files
    ]

    # Return format error if cleaned file list is empty and allow_blank is not set
    if not parsed_files and not allow_blank:
        add_format_error(answer_name, data, "No submitted answer for file upload.")

    for x in parsed_files:
        pl.add_submitted_file(data, x.get("name", ""), x.get("contents", ""))

    # Validate that all required files are present
    if parsed_files is not None:
        submitted_file_names = [x.get("name", "") for x in parsed_files]
        missing_files = [
            x for x in required_file_names if x not in submitted_file_names
        ]

        if len(missing_files) > 0:
            add_format_error(
                answer_name,
                data,
                "The following required files were missing: "
                + ", ".join(missing_files),
            )
