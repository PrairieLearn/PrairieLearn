import base64
import json
from pathlib import Path

import chevron
import lxml.html
import prairielearn as pl
from lxml.html import HtmlElement
from typing_extensions import assert_never

ATTR_ANSWER_NAME = "answers-name"
ATTR_WIDTH = "width"
ATTR_HEIGHT = "height"
ATTR_SOURCE_FILE_NAME = "source-file-name"
ATTR_SOURCE_DIRECTORY = "directory"


SOURCE_DIRECTORY_MAP = {
    "serverFilesCourse": "server_files_course_path",
    "clientFilesCourse": "client_files_course_path",
    "clientFilesQuestion": "client_files_question_path",
    ".": "question_path",
}


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attrs = [ATTR_ANSWER_NAME]
    optional_attrs = [
        ATTR_WIDTH,
        ATTR_HEIGHT,
        ATTR_SOURCE_FILE_NAME,
        ATTR_SOURCE_DIRECTORY,
    ]
    pl.check_attribs(element, required_attrs, optional_attrs)

    name = pl.get_string_attrib(element, ATTR_ANSWER_NAME)
    pl.check_answers_names(data, name)

    source_dir = pl.get_string_attrib(element, ATTR_SOURCE_DIRECTORY, ".")
    if source_dir not in SOURCE_DIRECTORY_MAP:
        raise RuntimeError(
            f"{source_dir=} must be one of {list(SOURCE_DIRECTORY_MAP.keys())}"
        )


def load_file_content(element: HtmlElement, data: pl.QuestionData) -> str:
    file_dir = SOURCE_DIRECTORY_MAP[
        pl.get_string_attrib(element, ATTR_SOURCE_DIRECTORY, ".")
    ]
    file = Path(data["options"][file_dir]) / pl.get_string_attrib(
        element, ATTR_SOURCE_FILE_NAME
    )
    if not file.exists():
        raise RuntimeError(f"Unknown file path: {file}")
    return file.read_text(encoding="utf-8")


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    drawing_name = pl.get_string_attrib(element, ATTR_ANSWER_NAME)
    initial_content: str = ""

    match data["panel"]:
        case "answer":
            # Answer must have a file attribute
            if not pl.has_attrib(element, ATTR_SOURCE_FILE_NAME):
                raise RuntimeError(
                    f"Answer drawing '{drawing_name}' does not have a `{ATTR_SOURCE_FILE_NAME}` argument"
                )
            initial_content = load_file_content(element, data)
        case "question":
            # First try loading the submission
            if drawing_name in data["submitted_answers"]:
                initial_content = (
                    data["submitted_answers"].get(drawing_name) or initial_content
                )
            # Next, try using the file attribute to load the starter diagram
            elif pl.has_attrib(element, ATTR_SOURCE_FILE_NAME):
                initial_content = load_file_content(element, data)
            # Finally, give up and mark it as empty
            else:
                initial_content = ""
        case "submission":
            initial_content = (
                data["submitted_answers"].get(drawing_name) or initial_content
            )
        case panel:
            assert_never(panel)

    content_bytes = json.dumps(
        {
            "read_only": data["panel"] != "question" or not data["editable"],
            "initial_content": initial_content,
            "width": pl.get_string_attrib(element, ATTR_WIDTH, "100%"),
            "height": pl.get_string_attrib(element, ATTR_HEIGHT, "800px"),
        }
    ).encode()

    errors = (
        data["format_errors"].get(drawing_name, [])
        if data["panel"] == "submission"
        else []
    )

    with open("pl-excalidraw.mustache", "r", encoding="utf-8") as template:
        return chevron.render(
            template,
            {
                "uuid": pl.get_uuid(),
                "name": drawing_name,
                "metadata": base64.b64encode(content_bytes).decode(),
                "errors": errors,
            },
        )


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    drawing_name = pl.get_string_attrib(element, ATTR_ANSWER_NAME)

    try:
        # Only check submissions if present. When one makes a submission using pl-excalidraw,
        # we always save a valid answer for all pl-excalidraw elements rendered in the question.
        # There might however be a standalone element inside pl-answer-panel without a submission;
        # it is okay to ignore them.
        if drawing_name in data["submitted_answers"]:
            json.loads(data["submitted_answers"][drawing_name])
    except Exception as e:
        if drawing_name not in data["format_errors"]:
            data["format_errors"][drawing_name] = []
        data["format_errors"][drawing_name].append(f"Invalid drawing submission: {e}")
