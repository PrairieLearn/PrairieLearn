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
ATTR_GRADABLE = "gradable"


SOURCE_DIRECTORY_MAP = {
    "serverFilesCourse": "server_files_course_path",
    "clientFilesCourse": "client_files_course_path",
    "clientFilesQuestion": "client_files_question_path",
    ".": "question_path",
}

# -----------------------------------------------------------------------------
# The logic below is derived from the combinations at
# https://github.com/PrairieLearn/PrairieLearn/pull/9900#discussion_r1685163461


def is_answer_name_required(gradable: bool) -> bool:
    """All cases marked (ANS)"""
    return gradable


def is_widget_editable(panel: str, gradable: bool, editable: bool) -> bool:
    """All cases where `(RW)` is marked. data["editable"] must also be True"""
    return panel == "question" and gradable and editable


def is_source_file_name_required(panel: str, gradable: bool, fresh: bool) -> bool:
    """All cases where `NoSource: Raise an error`"""
    return not gradable and (
        (panel == "question" and fresh) or panel in ("answer", "submission")
    )


# -----------------------------------------------------------------------------


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attrs = []
    optional_attrs = [
        ATTR_GRADABLE,
        ATTR_ANSWER_NAME,
        ATTR_WIDTH,
        ATTR_HEIGHT,
        ATTR_SOURCE_FILE_NAME,
        ATTR_SOURCE_DIRECTORY,
    ]
    pl.check_attribs(element, required_attrs, optional_attrs)

    gradable = pl.get_boolean_attrib(element, ATTR_GRADABLE, True)

    name = pl.get_string_attrib(element, ATTR_ANSWER_NAME, None)
    if name:
        pl.check_answers_names(data, name)

    if is_answer_name_required(gradable) and name is None:
        raise RuntimeError(
            f"Missing required attribute {ATTR_ANSWER_NAME} (Required when `{ATTR_GRADABLE}` is set)"
        )

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
    empty_diagram = ""  # pick a default representation
    element = lxml.html.fragment_fromstring(element_html)
    drawing_name = pl.get_string_attrib(element, ATTR_ANSWER_NAME, None)

    gradable = pl.get_boolean_attrib(element, ATTR_GRADABLE, True)
    fresh = drawing_name not in data["submitted_answers"]
    panel = data["panel"]
    source_available = pl.has_attrib(element, ATTR_SOURCE_FILE_NAME)

    # the state space (for debugging)
    matrix = f"{gradable=} {fresh=} {panel=} {source_available=}"

    if is_source_file_name_required(panel, gradable, fresh) and not source_available:
        raise RuntimeError(f"Missing required attribute `{ATTR_SOURCE_FILE_NAME}`")

    initial_content: str = empty_diagram

    # We sometimes want to render errors without rendering the widget
    show_widget = True

    # Notes:
    # 1. We could have simplified the if-else chains below by collapsing branches, but we use
    # the expanded form to make it easy to compare with the reference logic at
    # https://github.com/PrairieLearn/PrairieLearn/pull/9900#discussion_r1685163461
    # 2. Because we already handled raising an error on missing source file, the error cases
    # and invalid states are both tagged below as `unreachable`
    unreachable = RuntimeError(f"Unreachable code path reached with state {matrix=}")

    match panel:
        case "question":
            if gradable:
                if fresh:
                    if source_available:
                        initial_content = load_file_content(element, data)
                    else:
                        initial_content = empty_diagram
                else:  # submission
                    initial_content = data["submitted_answers"][drawing_name]
            else:  # not gradable
                if fresh and source_available:
                    initial_content = load_file_content(element, data)
                else:
                    raise unreachable

        case "answer":
            if gradable:
                show_widget = False
            else:  # not gradable
                if fresh and source_available:
                    initial_content = load_file_content(element, data)
                else:
                    raise unreachable

        case "submission":
            if gradable:
                if fresh:
                    raise unreachable
                else:  # submission
                    initial_content = data["submitted_answers"][drawing_name]
            else:  # not gradable
                if fresh and source_available:
                    initial_content = load_file_content(element, data)
                else:
                    raise unreachable

        case panel:
            assert_never(panel)

    content_bytes = json.dumps(
        {
            "read_only": not is_widget_editable(panel, gradable, data["editable"]),
            "initial_content": initial_content,
            "width": pl.get_string_attrib(element, ATTR_WIDTH, "100%"),
            "height": pl.get_string_attrib(element, ATTR_HEIGHT, "800px"),
        }
    ).encode()

    errors: list = []
    if panel == "submission" and drawing_name and drawing_name in data["format_errors"]:
        errors = data["format_errors"][drawing_name]

    render_data = {
        "uuid": pl.get_uuid(),
        "name": drawing_name,
        "metadata": base64.b64encode(content_bytes).decode(),
        "errors": errors,
        "show_widget": show_widget,
    }

    with open("pl-excalidraw.mustache", "r", encoding="utf-8") as template:
        return chevron.render(template, render_data)


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    drawing_name = pl.get_string_attrib(element, ATTR_ANSWER_NAME, None)

    if drawing_name:
        try:
            # Check the submissions if available
            if drawing_name in data["submitted_answers"]:
                json.loads(data["submitted_answers"][drawing_name])
        except Exception as e:
            if drawing_name not in data["format_errors"]:
                data["format_errors"][drawing_name] = []
            data["format_errors"][drawing_name].append(
                f"Invalid drawing submission: {e}"
            )
