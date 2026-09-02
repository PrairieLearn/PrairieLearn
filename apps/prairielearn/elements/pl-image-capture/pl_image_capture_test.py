import base64
import importlib
from io import BytesIO
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

image_capture = importlib.import_module("pl-image-capture")

ELEMENT_HTML = '<pl-image-capture file-name="solution.jpg"></pl-image-capture>'


def make_question_data(submitted_file_content: str | None) -> dict[str, Any]:
    answer_name = image_capture.get_answer_name("solution.jpg")
    return {
        "submitted_answers": (
            {answer_name: submitted_file_content}
            if submitted_file_content is not None
            else {}
        ),
        "raw_submitted_answers": {},
        "format_errors": {},
    }


def make_heic_data_uri(size: tuple[int, int]) -> str:
    image = Image.new("RGB", size, color="white")
    buffer = BytesIO()
    image.save(buffer, format="HEIF")
    payload = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/heic;base64,{payload}"


def test_parse_converts_heic_to_jpeg() -> None:
    data = make_question_data(make_heic_data_uri((64, 32)))

    image_capture.parse(ELEMENT_HTML, data)

    assert data["format_errors"] == {}
    submitted_file = data["submitted_answers"]["_files"][0]
    assert submitted_file["name"] == "solution.jpg"

    converted_image = Image.open(BytesIO(base64.b64decode(submitted_file["contents"])))
    assert converted_image.format == "JPEG"
    assert converted_image.size == (64, 32)


def test_parse_resizes_heic_before_converting() -> None:
    data = make_question_data(make_heic_data_uri((2001, 20)))

    image_capture.parse(ELEMENT_HTML, data)

    submitted_file = data["submitted_answers"]["_files"][0]
    converted_image = Image.open(BytesIO(base64.b64decode(submitted_file["contents"])))
    assert max(converted_image.size) == image_capture.MAX_IMAGE_SIDE_LENGTH


def test_parse_records_missing_image_error_for_element() -> None:
    data = make_question_data(None)

    image_capture.parse(ELEMENT_HTML, data)

    answer_name = image_capture.get_answer_name("solution.jpg")
    expected_error = "No image was submitted for solution.jpg."
    assert data["format_errors"][answer_name] == [expected_error]
    assert data["format_errors"]["_files"] == [expected_error]


@pytest.mark.parametrize(
    ("format_errors", "shows_invalid_badge"),
    [
        ({}, False),
        (
            {
                image_capture.get_answer_name("solution.jpg"): [
                    "No image was submitted for solution.jpg."
                ]
            },
            True,
        ),
    ],
)
def test_render_shows_element_format_error(
    monkeypatch: pytest.MonkeyPatch,
    format_errors: dict[str, list[str]],
    shows_invalid_badge: bool,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    data = {
        "panel": "submission",
        "submitted_answers": {},
        "options": {},
        "ai_grading": False,
        "editable": False,
        "format_errors": format_errors,
    }

    rendered_html = image_capture.render(ELEMENT_HTML, data)

    assert ('class="badge text-bg-danger"' in rendered_html) is shows_invalid_badge
