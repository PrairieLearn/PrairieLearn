import base64
import importlib

import pytest

file_editor = importlib.import_module("pl-file-editor")


@pytest.mark.parametrize("code", [b"print('hello')", b""])
def test_render_ai_submission_file_marker(code: bytes) -> None:
    output = file_editor.render(
        '<pl-file-editor file-name="src/a&amp;b.py"></pl-file-editor>',
        {
            "panel": "submission",
            "ai_grading": True,
            "submitted_answers": {
                "_files": [
                    {
                        "name": "src/a&b.py",
                        "contents": base64.b64encode(code).decode(),
                    },
                    {"name": "other.txt", "contents": ""},
                ]
            },
        },
    )
    assert output == (
        '<div data-ai-grading-file-name="src/a&amp;b.py">src/a&amp;b.py</div>'
    )


@pytest.mark.parametrize("submitted_answers", [{}, {"_files": []}])
def test_render_ai_submission_without_file(
    submitted_answers: dict[str, list[dict[str, str]]],
) -> None:
    assert (
        file_editor.render(
            '<pl-file-editor file-name="answer.py"></pl-file-editor>',
            {
                "panel": "submission",
                "ai_grading": True,
                "submitted_answers": submitted_answers,
            },
        )
        == ""
    )


@pytest.mark.parametrize(
    ("ai_grading", "panel"),
    [(False, "submission"), (False, "answer"), (True, "answer")],
)
def test_render_other_panels_are_empty(ai_grading: bool, panel: str) -> None:
    assert (
        file_editor.render(
            '<pl-file-editor file-name="answer.py"></pl-file-editor>',
            {"panel": panel, "ai_grading": ai_grading},
        )
        == ""
    )
