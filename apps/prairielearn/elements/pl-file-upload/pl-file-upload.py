import csv
import hashlib
import json
from io import StringIO

import chevron
import lxml.html
import prairielearn as pl
from colors import PLColor


def get_file_names_as_array(raw_file_names: str) -> list[str]:
    reader = csv.reader(
        StringIO(raw_file_names),
        delimiter=",",
        escapechar="\\",
        quoting=csv.QUOTE_NONE,
        skipinitialspace=True,
        strict=True,
    )
    return next(reader)


# Each pl-file-upload element is uniquely identified by the SHA1 hash of its
# file_names attribute
def get_answer_name(file_names: str) -> str:
    return "_file_upload_{0}".format(
        hashlib.sha1(file_names.encode("utf-8")).hexdigest()
    )


def add_format_error(data: pl.QuestionData, error_string: str) -> None:
    if "_files" not in data["format_errors"]:
        data["format_errors"]["_files"] = []
    data["format_errors"]["_files"].append(error_string)


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["file-names"]
    optional_attribs = []
    pl.check_attribs(element, required_attribs, optional_attribs)

    if "_required_file_names" not in data["params"]:
        data["params"]["_required_file_names"] = []
    file_names = get_file_names_as_array(pl.get_string_attrib(element, "file-names"))
    data["params"]["_required_file_names"].extend(file_names)


def render(element_html: str, data: pl.QuestionData) -> str:
    if data["panel"] != "question":
        return ""

    element = lxml.html.fragment_fromstring(element_html)
    uuid = pl.get_uuid()

    raw_file_names = pl.get_string_attrib(element, "file-names", "")
    file_names = sorted(get_file_names_as_array(raw_file_names))
    file_names_json = json.dumps(file_names, allow_nan=False)

    answer_name = get_answer_name(raw_file_names)

    # Only send the file names to the client. We don't include the contents
    # to avoid bloating the HTML. The client will fetch any submitted files
    # asynchronously once the page loads.
    #
    # We filter out any files that weren't specified in the file names for this element.
    submitted_files = data["submitted_answers"].get("_files", [])
    submitted_file_names = list(
        {x.get("name") for x in submitted_files} & set(file_names)
    )
    submitted_file_names_json = json.dumps(submitted_file_names, allow_nan=False)

    html_params = {
        "name": answer_name,
        "file_names": file_names_json,
        "uuid": uuid,
        "editable": data["editable"],
        "submission_files_url": data["options"].get("submission_files_url", None),
        "submitted_file_names": submitted_file_names_json,
        "check_icon_color": PLColor("correct_green"),
    }

    with open("pl-file-upload.mustache", "r", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    raw_file_names = pl.get_string_attrib(element, "file-names", "")
    required_file_names = get_file_names_as_array(raw_file_names)
    answer_name = get_answer_name(raw_file_names)

    # Get submitted answer or return parse_error if it does not exist
    files = data["submitted_answers"].get(answer_name, None)
    if not files:
        add_format_error(data, "No submitted answer for file upload.")
        return

    # We will store the files in the submitted_answer["_files"] key,
    # so delete the original submitted answer format to avoid
    # duplication
    del data["submitted_answers"][answer_name]

    try:
        parsed_files = json.loads(files)
    except Exception:
        add_format_error(data, "Could not parse submitted files.")
        parsed_files = []

    # Filter out any files that were not listed in file_names
    parsed_files = [x for x in parsed_files if x.get("name", "") in required_file_names]

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
