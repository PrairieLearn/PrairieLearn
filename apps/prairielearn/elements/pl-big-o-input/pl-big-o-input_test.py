import importlib
from pathlib import Path
from typing import Any

import lxml.html
import prairielearn.sympy_utils as psu
import pytest

big_o_input = importlib.import_module("pl-big-o-input")


def make_question_data() -> dict[str, Any]:
    return {
        "submitted_answers": {},
        "raw_submitted_answers": {},
        "correct_answers": {},
        "format_errors": {},
        "partial_scores": {},
        "panel": "question",
        "editable": True,
    }


def get_help_values(rendered: str, label: str) -> list[str]:
    rendered_html = lxml.html.fragment_fromstring(rendered, create_parent="div")
    help_buttons = rendered_html.xpath(".//button[@data-bs-content]")
    assert len(help_buttons) == 1
    help_html = help_buttons[0].get("data-bs-content")
    assert help_html is not None
    help_fragment = lxml.html.fragment_fromstring(help_html, create_parent="div")
    paragraphs = help_fragment.xpath(
        f'.//p[strong[normalize-space()="Allowable {label}:"]]'
    )
    assert len(paragraphs) == 1
    return paragraphs[0].xpath(".//code/text()")


def test_rendered_help_uses_public_builtin_names_in_stable_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    rendered = big_o_input.render(
        '<pl-big-o-input answers-name="test"></pl-big-o-input>', make_question_data()
    )

    assert get_help_values(rendered, "constants") == ["e", "infty", "pi"]

    operators = get_help_values(rendered, "operators")
    assert operators[: len(psu.STANDARD_OPERATORS)] == list(psu.STANDARD_OPERATORS)
    assert operators[len(psu.STANDARD_OPERATORS) :] == sorted(
        operators[len(psu.STANDARD_OPERATORS) :]
    )
    assert set(operators).isdisjoint({"Number", "_Integer"})
