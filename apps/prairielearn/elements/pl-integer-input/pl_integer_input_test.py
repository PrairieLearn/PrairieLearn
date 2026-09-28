import importlib
from pathlib import Path
from typing import Any

import chevron
import lxml.html
import pytest

integer_input = importlib.import_module("pl-integer-input")


@pytest.fixture
def question_data(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    monkeypatch.chdir(Path(__file__).parent)
    return {
        "panel": "question",
        "editable": True,
        "answers_names": {},
        "correct_answers": {},
        "submitted_answers": {},
        "raw_submitted_answers": {},
        "format_errors": {},
        "partial_scores": {},
    }


@pytest.mark.parametrize("base", [None, 0, 2, 10, 11, 16, 36])
def test_render_text_keyboard(question_data: dict[str, Any], base: int | None) -> None:
    base_attribute = "" if base is None else f'base="{base}"'
    element_html = (
        f'<pl-integer-input answers-name="answer" {base_attribute}></pl-integer-input>'
    )
    integer_input.prepare(element_html, question_data)

    rendered = lxml.html.fragment_fromstring(
        integer_input.render(element_html, question_data)
    )
    answer_input = rendered.cssselect('input[name="answer"]')[0]
    assert answer_input.get("type") == "text"
    assert answer_input.get("inputmode") == "text"


@pytest.mark.parametrize("use_numeric", [None, False, True])
def test_template_accepts_legacy_use_numeric(use_numeric: bool | None) -> None:
    template = Path(__file__).with_name("pl-integer-input.mustache").read_text()
    html_params = {"question": True}
    if use_numeric is not None:
        html_params["use_numeric"] = use_numeric

    rendered = lxml.html.fragment_fromstring(chevron.render(template, html_params))
    answer_input = rendered.cssselect("input")[0]
    assert answer_input.get("type") == "text"
    assert answer_input.get("inputmode") == "text"


@pytest.mark.parametrize(
    ("base", "answer", "expected"),
    [(10, "-3", -3), (2, "-11", -3), (0, "-0xA", -10)],
)
def test_negative_answer(
    question_data: dict[str, Any], base: int, answer: str, expected: int
) -> None:
    element_html = f'<pl-integer-input answers-name="answer" base="{base}" correct-answer="{answer}"></pl-integer-input>'
    integer_input.prepare(element_html, question_data)
    question_data["submitted_answers"]["answer"] = answer

    integer_input.parse(element_html, question_data)
    assert question_data["format_errors"] == {}
    assert question_data["submitted_answers"]["answer"] == expected

    integer_input.grade(element_html, question_data)
    assert question_data["partial_scores"]["answer"]["score"] == 1
