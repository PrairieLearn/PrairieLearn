import importlib
from pathlib import Path
from typing import Any

import pytest

units_input = importlib.import_module("pl-units-input")


def test_custom_grading_without_correct_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    html = '<pl-units-input answers-name="moment"></pl-units-input>'
    data: dict[str, Any] = {
        "correct_answers": {},
        "raw_submitted_answers": {},
        "panel": "question",
        "editable": True,
        "submitted_answers": {"moment": "8 N*m"},
        "answers_names": {},
        "format_errors": {},
        "partial_scores": {"moment": {"score": 0.5, "weight": 1}},
    }

    units_input.prepare(html, data)
    rendered = units_input.render(html, data)
    assert 'placeholder="Number + Unit"' in rendered
    units_input.parse(html, data)
    units_input.grade(html, data)

    assert data["format_errors"] == {}
    assert data["submitted_answers"]["moment"] == "8 meter * newton"
    assert data["partial_scores"]["moment"] == {"score": 0.5, "weight": 1}
