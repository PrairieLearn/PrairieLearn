import importlib
from typing import Any

import pytest

pl_matching = importlib.import_module("pl-matching")


def matching_html(extra_attrs: str = "") -> str:
    extra = f" {extra_attrs}" if extra_attrs else ""
    return f"""<pl-matching answers-name="match" fixed-order="true" fixed-options-order="true"{extra}>
  <pl-statement match="a">Statement A</pl-statement>
  <pl-statement match="b">Statement B</pl-statement>
  <pl-option name="a">Option A</pl-option>
  <pl-option name="b">Option B</pl-option>
</pl-matching>"""


def make_question_data() -> dict[str, Any]:
    return {
        "params": {},
        "correct_answers": {},
        "answers_names": {},
        "submitted_answers": {},
        "format_errors": {},
        "partial_scores": {},
    }


def test_grade_defaults_to_partial_credit() -> None:
    data = make_question_data()
    element_html = matching_html()
    pl_matching.prepare(element_html, data)
    data["submitted_answers"] = {
        "match-dropdown-0": "0",
        "match-dropdown-1": "0",
    }

    pl_matching.grade(element_html, data)

    assert data["partial_scores"]["match"]["score"] == pytest.approx(0.5)


def test_grade_can_disable_partial_credit() -> None:
    data = make_question_data()
    element_html = matching_html('partial-credit="false"')
    pl_matching.prepare(element_html, data)
    data["submitted_answers"] = {
        "match-dropdown-0": "0",
        "match-dropdown-1": "0",
    }

    pl_matching.grade(element_html, data)

    assert data["partial_scores"]["match"]["score"] == 0
