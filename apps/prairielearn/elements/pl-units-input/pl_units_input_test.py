import importlib
from pathlib import Path
from typing import Any

import pytest

units_input = importlib.import_module("pl-units-input")


def test_newton_meter_input() -> None:
    html = '<pl-units-input answers-name="moment" atol="1Nm"></pl-units-input>'
    data: dict[str, Any] = {
        "correct_answers": {"moment": "7.2Nm"},
        "submitted_answers": {"moment": "8 N*m"},
        "answers_names": {},
        "format_errors": {},
        "partial_scores": {},
    }

    units_input.prepare(html, data)
    units_input.parse(html, data)
    units_input.grade(html, data)

    assert data["format_errors"] == {}
    assert data["partial_scores"]["moment"]["score"] == 1


@pytest.mark.parametrize(
    ("mode", "correct_answer", "submitted_answer", "raw_answer", "expected_score"),
    [
        ("with-units", "7.2Nm", "7.2 number_meter", "7.2Nm", 1),
        ("with-units", "7.2Nm", "7.2 number_meter", "7.2 number_meter", 0),
        ("only-units", "Nm", "number_meter", "Nm", 1),
        ("exact-units", "7.2 N*m", "7.2 number_meter", "7.2Nm", 1),
    ],
)
def test_saved_newton_meter_submission(
    mode: str,
    correct_answer: str,
    submitted_answer: str,
    raw_answer: str,
    expected_score: int,
) -> None:
    data: dict[str, Any] = {
        "correct_answers": {"moment": correct_answer},
        "submitted_answers": {"moment": submitted_answer},
        "raw_submitted_answers": {"moment": raw_answer},
        "partial_scores": {},
    }

    units_input.grade(
        f'<pl-units-input answers-name="moment" grading-mode="{mode}"></pl-units-input>',
        data,
    )

    assert data["partial_scores"]["moment"]["score"] == expected_score


def test_custom_grading_without_correct_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    html = '<pl-units-input answers-name="moment"></pl-units-input>'
    data: dict[str, Any] = {
        "correct_answers": {},
        "raw_submitted_answers": {},
        "panel": "question",
        "editable": True,
        "submitted_answers": {"moment": "8Nm"},
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
