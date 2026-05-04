import base64
import csv
import fnmatch
import hashlib
import json
import random
import re
import string
from io import StringIO

import chevron
import lxml.html
import prairielearn as pl
from prairielearn.colors import PLColor

FILE_NAMES_DEFAULT = None
OPTIONAL_FILE_NAMES_DEFAULT = None
FILE_PATTERNS_DEFAULT = None
OPTIONAL_FILE_PATTERNS_DEFAULT = None


def get_file_names_as_array(raw_file_names: str | None) -> list[str]:
    """Convert a comma-separated list of file names into an array"""
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


def match_regex_with_files(
    regex_patterns: list[str], files_names: set[str], limit_1: bool
) -> tuple[list[str], list[str]]:
    """
    Take a list of regexes and a list of file names and matches them 1:n or 1:1, depending on limit_1 parameter

    Returns:
        A tuple of matched file names and unmatched patterns
    """
    unmatched_patterns = regex_patterns.copy()
    remaining_files = files_names.copy()
    for pattern in regex_patterns:
        regex = re.compile(pattern, re.IGNORECASE)
        for file in remaining_files.copy():
            if regex.match(file) and (not limit_1 or pattern in unmatched_patterns):
                if pattern in unmatched_patterns:
                    unmatched_patterns.remove(pattern)
                remaining_files.remove(file)

    return [f for f in files_names if f not in remaining_files], unmatched_patterns


def glob_to_regex(glob_pattern: str) -> str:
    """Translate a glob pattern into a regex that can be handled consistently across Python and JS.

    Returns:
        The regex as a string

    Raises:
        ValueError: If the glob pattern is invalid
    """
    if "/" in glob_pattern:
        raise ValueError(
            f"The file name pattern {glob_pattern} contains a '/' character, which is not allowed in file names."
        )
    return fnmatch.translate(glob_pattern).replace("(?s:", "^").replace(r")\Z", "$")


def get_answer_name(
    file_names: str | None,
    optional_file_names: str | None = None,
    file_patterns: str | None = None,
    optional_file_patterns: str | None = None,
) -> str:
    """
    Compute the unique identifier of a pl-file-upload element, which is the SHA1 hash of all its
    file name attributes

    Returns:
        The unique identifier of a pl-file-upload element
    """
    # Using / as separator as the only character guaranteed not to appear in file names
    combined_name = (
        (file_names or "")
        + ("/" + optional_file_names if optional_file_names else "")
        + ("//" + file_patterns if file_patterns else "")
        + ("////" + optional_file_patterns if optional_file_patterns else "")
    )

    return "_file_upload_" + hashlib.sha1(combined_name.encode("utf-8")).hexdigest()


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

    # At least one file-names/patterns attributed is required
    required_attribs = []
    optional_attribs = [
        "file-names",
        "optional-file-names",
        "file-patterns",
        "optional-file-patterns",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)

    file_names = pl.get_string_attrib(element, "file-names", FILE_NAMES_DEFAULT)
    opt_file_names = pl.get_string_attrib(
        element, "optional-file-names", OPTIONAL_FILE_NAMES_DEFAULT
    )
    file_patterns = pl.get_string_attrib(
        element, "file-patterns", FILE_PATTERNS_DEFAULT
    )
    opt_file_patterns = pl.get_string_attrib(
        element, "optional-file-patterns", OPTIONAL_FILE_PATTERNS_DEFAULT
    )
    if (
        not file_names
        and not opt_file_names
        and not file_patterns
        and not opt_file_patterns
    ):
        raise ValueError(
            'At least one attribute of "file-names", "optional-file-names", "file-patterns", or "optional-file-patterns" must be provided.'
        )

    if (
        (file_names and "/" in file_names)
        or (opt_file_names and "/" in opt_file_names)
        or (file_patterns and "/" in file_patterns)
        or (opt_file_patterns and "/" in opt_file_patterns)
    ):
        raise ValueError(
            'None of the attributes "file-names", "optional-file-names", "file-patterns", and "optional-file-patterns" can contain a "/" character.'
        )

    if "_required_file_names" not in data["params"]:
        data["params"]["_required_file_names"] = []

    required_file_names = get_file_names_as_array(
        pl.get_string_attrib(element, "file-names", "")
    )
    data["params"]["_required_file_names"].extend(required_file_names)


def render(element_html: str, data: pl.QuestionData) -> str:
    if data["panel"] != "question":
        return ""

    element = lxml.html.fragment_fromstring(element_html)
    uuid = pl.get_uuid()

    raw_file_names = pl.get_string_attrib(element, "file-names", FILE_NAMES_DEFAULT)
    file_names = sorted(get_file_names_as_array(raw_file_names))
    file_names_json = json.dumps(file_names, allow_nan=False)

    raw_opt_file_names = pl.get_string_attrib(
        element, "optional-file-names", OPTIONAL_FILE_NAMES_DEFAULT
    )
    opt_file_names = sorted(get_file_names_as_array(raw_opt_file_names))
    opt_file_names_json = json.dumps(opt_file_names, allow_nan=False)

    raw_file_patterns = pl.get_string_attrib(
        element, "file-patterns", FILE_PATTERNS_DEFAULT
    )
    file_patterns = sorted(get_file_names_as_array(raw_file_patterns))

    raw_opt_file_patterns = pl.get_string_attrib(
        element, "optional-file-patterns", OPTIONAL_FILE_PATTERNS_DEFAULT
    )
    opt_file_patterns = sorted(get_file_names_as_array(raw_opt_file_patterns))

    # Convert patterns into regular expressions
    file_regex = [glob_to_regex(f) for f in file_patterns]
    opt_file_regex = [glob_to_regex(f) for f in opt_file_patterns]

    # Need to send both converted regex and original pattern to client for matching and printing
    file_regex_json = json.dumps(
        list(zip(file_regex, file_patterns, strict=False)), allow_nan=False
    )
    opt_file_regex_json = json.dumps(
        list(zip(opt_file_regex, opt_file_patterns, strict=False)), allow_nan=False
    )

    answer_name = get_answer_name(
        raw_file_names,
        raw_opt_file_names,
        raw_file_patterns,
        raw_opt_file_patterns,
    )
    parse_error = data["format_errors"].get(answer_name, [])

    # Only send the file names to the client. We don't include the contents
    # to avoid bloating the HTML. The client will fetch any submitted files
    # asynchronously once the page loads
    submitted_files = data["submitted_answers"].get("_files", [])
    submitted_file_names = {x.get("name") for x in submitted_files}

    # We find any files that match an accepted file name/pattern
    # Most of this can be done using sets, but file_regex/opt_file_regex
    # must remain as lists because they can have duplicates!
    required_files = submitted_file_names & set(file_names)
    remaining_files = submitted_file_names - set(file_names)
    wildcard_files = set(
        match_regex_with_files(file_regex, remaining_files, limit_1=True)[0]
    )
    remaining_files -= wildcard_files
    optional_files = remaining_files & set(opt_file_names)
    opt_wildcard_files = set(
        match_regex_with_files(opt_file_regex, submitted_file_names, limit_1=False)[0]
    )

    accepted_file_names = list(
        required_files | optional_files | wildcard_files | opt_wildcard_files
    )

    submitted_file_names_json = json.dumps(accepted_file_names, allow_nan=False)

    html_params = {
        "name": answer_name,
        "file_names": file_names_json,
        "file_regex": file_regex_json,
        "optional_file_names": opt_file_names_json,
        "optional_file_regex": opt_file_regex_json,
        "uuid": uuid,
        "editable": data["editable"],
        "submission_files_url": data["options"].get("submission_files_url"),
        "submitted_file_names": submitted_file_names_json,
        "check_icon_color": PLColor("correct_green"),
        "parse_error": "<br>".join(parse_error),
    }

    with open("pl-file-upload.mustache", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    raw_file_names = pl.get_string_attrib(element, "file-names", FILE_NAMES_DEFAULT)
    file_names = get_file_names_as_array(raw_file_names)
    raw_opt_file_names = pl.get_string_attrib(
        element, "optional-file-names", OPTIONAL_FILE_NAMES_DEFAULT
    )
    opt_file_names = get_file_names_as_array(raw_opt_file_names)
    raw_file_patterns = pl.get_string_attrib(
        element, "file-patterns", FILE_PATTERNS_DEFAULT
    )
    file_patterns = get_file_names_as_array(raw_file_patterns)
    raw_opt_file_patterns = pl.get_string_attrib(
        element, "optional-file-patterns", OPTIONAL_FILE_PATTERNS_DEFAULT
    )
    opt_file_patterns = get_file_names_as_array(raw_opt_file_patterns)

    answer_name = get_answer_name(
        raw_file_names,
        raw_opt_file_names,
        raw_file_patterns,
        raw_opt_file_patterns,
    )

    # Get submitted answer or return format error if it does not exist
    files = data["submitted_answers"].get(answer_name, None)
    if not files:
        add_format_error(answer_name, data, "No submitted answer for file upload.")
        return

    # We will store the files in the submitted_answer["_files"] key,
    # so delete the original submitted answer format to avoid
    # duplication
    data["submitted_answers"].pop(answer_name, None)

    try:
        parsed_files = json.loads(files)
    except Exception:
        add_format_error(answer_name, data, "Could not parse submitted files.")
        parsed_files = []

    if parsed_files is not None:
        parsed_file_names = [f.get("name", "") for f in parsed_files]

        # Split optional names into two separate lists: wildcard patterns and plain names
        files_regex = [glob_to_regex(f) for f in file_patterns]
        opt_files_regex = [glob_to_regex(f) for f in opt_file_patterns]

        # Match submitted and accepted files 1:1 in this order: required_files, then required patterns, then optional files.
        # All remaining files are then matched 1:n with optional patterns, and eventually discarded in there is no match
        required_files, remaining_files = pl.partition(
            parsed_file_names, file_names.__contains__
        )

        pattern_files, missing_regex = match_regex_with_files(
            files_regex,
            set(remaining_files),
            limit_1=True,
        )
        remaining_files = [x for x in remaining_files if x not in pattern_files]

        # Validate that all required files are present
        missing_files = [x for x in file_names if x not in parsed_file_names]

        if len(missing_files) > 0:
            add_format_error(
                answer_name,
                data,
                f"The following required files were missing: {', '.join(missing_files)}",
            )

        if len(missing_regex) > 0:
            # Need some awkward mapping to patterns here to ensure we don't remove duplicates
            missing_patterns = ", ".join(
                file_patterns[files_regex.index(r)] for r in missing_regex
            )
            add_format_error(
                answer_name,
                data,
                f"The following required file patterns were missing: {missing_patterns}",
            )

        optional_files, remaining_files = pl.partition(
            remaining_files, opt_file_names.__contains__
        )
        # We don't care which optional patterns are matched
        opt_pattern_files, _ = match_regex_with_files(
            opt_files_regex,
            set(remaining_files),
            limit_1=False,
        )

        # Finally, we filter the parsed files based on the allowed names
        include_set = (
            set(required_files)
            | set(pattern_files)
            | set(optional_files)
            | set(opt_pattern_files)
        )
        for file in parsed_files:
            file_name = file.get("name", "")
            if file_name in include_set:
                pl.add_submitted_file(data, file_name, file.get("contents", ""))


BRACKET_STAR = "__BRACKET_STAR__"
BRACKET_QUESTION_MARK = "__BRACKET_QUESTION_MARK__"


def generate_filename_from_pattern(pattern: str, suffix: str = "") -> str:
    """Generate a plausible filename from a glob pattern for testing. The suffix is appended to wildcard substitutions, allowing distinct filenames to be generated from the same pattern."""

    def replace_bracket(m: re.Match[str]) -> str:
        content = m.group(1)
        if content.startswith("!"):
            # Negated class: find a character that satisfies the constraint
            bracket_pattern = "[" + content + "]"
            for c in string.ascii_letters + string.digits + "_-":
                if fnmatch.fnmatch(c, bracket_pattern):
                    return c
            return "x"
        char = content[0]
        if char == "*":
            return BRACKET_STAR
        if char == "?":
            return BRACKET_QUESTION_MARK
        return char

    wildcard_replacement = f"test_file{suffix}"
    result = re.sub(r"\[([^\]]+)\]", replace_bracket, pattern)
    result = result.replace("**", wildcard_replacement)
    result = result.replace("*", wildcard_replacement)
    result = result.replace("?", "x")
    result = result.replace(BRACKET_STAR, "*")
    result = result.replace(BRACKET_QUESTION_MARK, "?")
    return result


def _generate_unique_filenames(
    literal_names: list[str], patterns: list[str]
) -> list[str]:
    origin: dict[str, str] = {}
    names: list[str] = []

    def add(name: str, source: str) -> None:
        if name in origin:
            raise ValueError(
                f"Cannot generate distinct filenames for {origin[name]} "
                f"and {source} (both produce '{name}')."
            )
        origin[name] = source
        names.append(name)

    for n in literal_names:
        add(n, f"file name '{n}'")
    pattern_counts: dict[str, int] = {}
    for p in patterns:
        idx = pattern_counts.get(p, 0)
        pattern_counts[p] = idx + 1
        suffix = f"_{idx}" if idx > 0 else ""
        add(generate_filename_from_pattern(p, suffix), f"pattern '{p}' (#{idx + 1})")
    return names


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)

    raw_file_names = pl.get_string_attrib(element, "file-names", FILE_NAMES_DEFAULT)
    raw_opt_file_names = pl.get_string_attrib(
        element, "optional-file-names", OPTIONAL_FILE_NAMES_DEFAULT
    )
    raw_file_patterns = pl.get_string_attrib(
        element, "file-patterns", FILE_PATTERNS_DEFAULT
    )
    raw_opt_file_patterns = pl.get_string_attrib(
        element, "optional-file-patterns", OPTIONAL_FILE_PATTERNS_DEFAULT
    )

    answer_name = get_answer_name(
        raw_file_names, raw_opt_file_names, raw_file_patterns, raw_opt_file_patterns
    )
    file_names = get_file_names_as_array(raw_file_names)
    opt_file_names = get_file_names_as_array(raw_opt_file_names)
    file_patterns = get_file_names_as_array(raw_file_patterns)
    opt_file_patterns = get_file_names_as_array(raw_opt_file_patterns)
    result = data["test_type"]

    if result in {"correct", "incorrect"}:
        selected_opt_file_names = random.sample(
            opt_file_names, random.randint(0, len(opt_file_names))
        )
        # Each optional pattern may match 0..N files, and the same pattern can
        # be repeated. Patterns without wildcards can only generate one unique
        # filename, so they can match at most once.
        selected_opt_file_patterns: list[str] = []
        for p in opt_file_patterns:
            max_count = 2 if any(c in p for c in "*?") else 1
            selected_opt_file_patterns.extend([p] * random.randint(0, max_count))
        all_names = _generate_unique_filenames(
            file_names + selected_opt_file_names,
            file_patterns + selected_opt_file_patterns,
        )

        if not all_names:
            if opt_file_names:
                all_names = [random.choice(opt_file_names)]
            elif opt_file_patterns:
                all_names = [
                    generate_filename_from_pattern(random.choice(opt_file_patterns))
                ]
            else:
                return

        files = []
        for name in all_names:
            content = base64.b64encode(f"Test {result} for {name}".encode()).decode(
                "utf-8"
            )
            files.append({"name": name, "contents": content})

        data["raw_submitted_answers"][answer_name] = json.dumps(files)

    elif result == "invalid":
        if file_names:
            # Submit with a required file missing to test validation
            # The remaining files are still submitted
            missing_file = file_names[0]
            submitted_names = _generate_unique_filenames(file_names[1:], file_patterns)
            files = []
            for name in submitted_names:
                content = base64.b64encode(f"Test invalid for {name}".encode()).decode(
                    "utf-8"
                )
                files.append({"name": name, "contents": content})
            data["raw_submitted_answers"][answer_name] = json.dumps(files)
            add_format_error(
                answer_name,
                data,
                f"The following required files were missing: {missing_file}",
            )
        else:
            data["raw_submitted_answers"][answer_name] = ""
            add_format_error(answer_name, data, "No submitted answer for file upload.")
