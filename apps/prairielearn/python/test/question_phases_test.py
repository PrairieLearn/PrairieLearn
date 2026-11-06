import base64
import sys
from pathlib import Path

import pytest
from prairielearn import QuestionData
from prairielearn.internal.question_phases import RenderContext, process


@pytest.fixture
def file_context(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> RenderContext:
    element_path = tmp_path / "elements" / "test-file"
    element_path.mkdir(parents=True)
    (element_path / "test-file.py").write_text(
        """import lxml.html


def file(element_html, data):
    filename = lxml.html.fromstring(element_html).get("filename")
    if filename == data["filename"]:
        return filename.encode()
    return None
"""
    )
    # The dispatcher changes both globals while loading element controllers.
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(sys, "path", sys.path.copy())
    return {
        "html": '<test-file filename="first.txt"></test-file>'
        '<test-file filename="second.txt"></test-file>',
        "elements": {
            "test-file": {
                "name": "test-file",
                "controller": "test-file.py",
                "type": "course",
            }
        },
        "element_extensions": {},
        "course_path": str(tmp_path),
    }


@pytest.mark.parametrize(
    ("filename", "expected"),
    [("first.txt", b"first.txt"), ("second.txt", b"second.txt"), ("missing.txt", b"")],
)
def test_file_ignores_none_results(
    file_context: RenderContext,
    question_data: QuestionData,
    filename: str,
    expected: bytes,
) -> None:
    result, _ = process("file", {**question_data, "filename": filename}, file_context)

    assert result == base64.b64encode(expected).decode()


def test_file_rejects_multiple_results(
    file_context: RenderContext, question_data: QuestionData
) -> None:
    file_context["html"] = '<test-file filename="first.txt"></test-file>' * 2

    with pytest.raises(RuntimeError, match="Another element already returned a file"):
        process("file", {**question_data, "filename": "first.txt"}, file_context)
