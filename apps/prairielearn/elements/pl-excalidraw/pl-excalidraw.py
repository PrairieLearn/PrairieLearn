import base64
import json
import re
from pathlib import Path

import chevron
import lxml.html
import prairielearn as pl
from lxml.html import HtmlElement

UNITLESS_NUMBER_RE = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$")


SOURCE_DIRECTORY_MAP = {
    "serverFilesCourse": "server_files_course_path",
    "clientFilesCourse": "client_files_course_path",
    "clientFilesQuestion": "client_files_question_path",
    ".": "question_path",
}


def check_css_size_attrib(element: HtmlElement, attrib: str) -> None:
    value = pl.get_string_attrib(element, attrib, None)
    if value is not None and UNITLESS_NUMBER_RE.match(value.strip()):
        raise ValueError(
            f'Attribute "{attrib}" must be a CSS size value, not the unitless number '
            f'"{value}". Use a value with units, such as "900px" for pixels.'
        )


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
        "gradable",
        "answers-name",
        "width",
        "height",
        "source-file-name",
        "directory",
    ]
    pl.check_attribs(element, required_attrs, optional_attrs)
    check_css_size_attrib(element, "width")
    check_css_size_attrib(element, "height")

    gradable = pl.get_boolean_attrib(element, "gradable", True)

    name = pl.get_string_attrib(element, "answers-name", None)
    if name:
        pl.check_answers_names(data, name)

    if is_answer_name_required(gradable) and name is None:
        raise RuntimeError(
            "Missing required attribute answers-name (Required when `gradable` is set)"
        )

    source_dir = pl.get_string_attrib(element, "directory", ".")
    if source_dir not in SOURCE_DIRECTORY_MAP:
        raise RuntimeError(
            f"{source_dir=} must be one of {list(SOURCE_DIRECTORY_MAP.keys())}"
        )


def load_file_content(element: HtmlElement, data: pl.QuestionData) -> str:
    file_dir = SOURCE_DIRECTORY_MAP[pl.get_string_attrib(element, "directory", ".")]
    file = Path(data["options"][file_dir]) / pl.get_string_attrib(
        element, "source-file-name"
    )
    if not file.exists():
        raise RuntimeError(f"Unknown file path: {file}")
    return file.read_text(encoding="utf-8")


def render(element_html: str, data: pl.QuestionData) -> str:
    empty_diagram = ""  # pick a default representation
    element = lxml.html.fragment_fromstring(element_html)
    drawing_name = pl.get_string_attrib(element, "answers-name", None)

    gradable = pl.get_boolean_attrib(element, "gradable", True)
    fresh = drawing_name not in data["submitted_answers"]
    panel = data["panel"]
    source_available = pl.has_attrib(element, "source-file-name")

    # the state space (for debugging)
    matrix = f"{gradable=} {fresh=} {panel=} {source_available=}"

    if is_source_file_name_required(panel, gradable, fresh) and not source_available:
        raise RuntimeError("Missing required attribute `source-file-name`")

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
                    assert drawing_name is not None
                    initial_content = data["submitted_answers"][drawing_name]
            elif fresh and source_available:
                initial_content = load_file_content(element, data)
            else:
                raise unreachable

        case "answer":
            if gradable:
                show_widget = False
            elif fresh and source_available:
                initial_content = load_file_content(element, data)
            else:
                raise unreachable

        case "submission":
            if gradable:
                if fresh:
                    raise unreachable
                # submission
                assert drawing_name is not None
                initial_content = data["submitted_answers"][drawing_name]
            elif fresh and source_available:
                initial_content = load_file_content(element, data)
            else:
                raise unreachable

    content_bytes = json.dumps({
        "read_only": not is_widget_editable(panel, gradable, data["editable"]),
        "initial_content": initial_content,
        "width": pl.get_string_attrib(element, "width", "100%"),
        "height": pl.get_string_attrib(element, "height", "800px"),
    }).encode()

    errors: list[str] = []
    if panel == "submission" and drawing_name and drawing_name in data["format_errors"]:
        errors = data["format_errors"][drawing_name]

    render_data = {
        "uuid": pl.get_uuid(),
        "name": drawing_name,
        "metadata": base64.b64encode(content_bytes).decode(),
        "errors": errors,
        "show_widget": show_widget,
    }

    with open("pl-excalidraw.mustache", encoding="utf-8") as template:
        return chevron.render(template, render_data)


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    drawing_name = pl.get_string_attrib(element, "answers-name", None)

    if drawing_name:
        try:
            # Check the submissions if available
            if drawing_name in data["submitted_answers"]:
                json.loads(data["submitted_answers"][drawing_name])
        except ValueError as exc:
            if drawing_name not in data["format_errors"]:
                data["format_errors"][drawing_name] = []
            data["format_errors"][drawing_name].append(
                f"Invalid drawing submission: {exc}"
            )


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    gradable = pl.get_boolean_attrib(element, "gradable", True)
    if not gradable:
        return

    drawing_name = pl.get_string_attrib(element, "answers-name")
    result = data["test_type"]

    if result in {"correct", "incorrect"}:
        text = f"Test {result}"
        data["raw_submitted_answers"][drawing_name] = json.dumps({
            "type": "excalidraw",
            "version": 2,
            "source": "test",
            "elements": [
                # Matches the type definition from the excalidraw library
                {
                    "type": "text",
                    "id": f"test-{result}",
                    "x": 0,
                    "y": 0,
                    "width": 200,
                    "height": 25,
                    "angle": 0,
                    "strokeColor": "#000000",
                    "backgroundColor": "transparent",
                    "fillStyle": "solid",
                    "strokeWidth": 1,
                    "strokeStyle": "solid",
                    "roundness": None,
                    "roughness": 1,
                    "opacity": 100,
                    "seed": 1,
                    "version": 1,
                    "versionNonce": 1,
                    "index": None,
                    "isDeleted": False,
                    "groupIds": [],
                    "frameId": None,
                    "boundElements": None,
                    "updated": 0,
                    "link": None,
                    "locked": False,
                    "text": text,
                    "fontSize": 20,
                    "fontFamily": 1,
                    "textAlign": "left",
                    "verticalAlign": "top",
                    "containerId": None,
                    "originalText": text,
                    "autoResize": True,
                    "lineHeight": 1.25,
                },
            ],
            "appState": {},
            "files": {},
        })
    elif result == "invalid":
        invalid_submission = "not valid json"
        data["raw_submitted_answers"][drawing_name] = invalid_submission
        try:
            json.loads(invalid_submission)
        except ValueError as exc:
            data["format_errors"][drawing_name] = [f"Invalid drawing submission: {exc}"]
