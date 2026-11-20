"""Gradable elements reject a negative `weight` attribute when the question is prepared."""

import importlib
from pathlib import Path

import pytest
from prairielearn import QuestionData

ELEMENTS_DIR = Path(__file__).resolve().parents[2] / "elements"

# Markup that each element's `prepare()` accepts; `{weight}` is replaced with the
# `weight` attribute under test.
ELEMENT_HTML = {
    "pl-big-o-input": '<pl-big-o-input answers-name="a" correct-answer="n" {weight}></pl-big-o-input>',
    "pl-checkbox": (
        '<pl-checkbox answers-name="a" {weight}>'
        '<pl-answer correct="true">A</pl-answer><pl-answer>B</pl-answer>'
        "</pl-checkbox>"
    ),
    "pl-drawing": (
        '<pl-drawing gradable="true" answers-name="a" {weight}>'
        "<pl-drawing-answer></pl-drawing-answer>"
        "</pl-drawing>"
    ),
    "pl-dropdown": (
        '<pl-dropdown answers-name="a" {weight}>'
        '<pl-answer correct="true">A</pl-answer><pl-answer>B</pl-answer>'
        "</pl-dropdown>"
    ),
    "pl-integer-input": '<pl-integer-input answers-name="a" correct-answer="1" {weight}></pl-integer-input>',
    "pl-matching": (
        '<pl-matching answers-name="a" {weight}>'
        '<pl-statement match="x">S</pl-statement><pl-option name="x">O</pl-option>'
        "</pl-matching>"
    ),
    "pl-matrix-component-input": (
        '<pl-matrix-component-input answers-name="a" rows="2" columns="2" {weight}>'
        "</pl-matrix-component-input>"
    ),
    "pl-matrix-input": '<pl-matrix-input answers-name="a" {weight}></pl-matrix-input>',
    "pl-multiple-choice": (
        '<pl-multiple-choice answers-name="a" {weight}>'
        '<pl-answer correct="true">A</pl-answer><pl-answer>B</pl-answer>'
        "</pl-multiple-choice>"
    ),
    "pl-number-input": '<pl-number-input answers-name="a" correct-answer="1" {weight}></pl-number-input>',
    "pl-order-blocks": (
        '<pl-order-blocks answers-name="a" {weight}>'
        '<pl-answer correct="true">A</pl-answer><pl-answer correct="true">B</pl-answer>'
        "</pl-order-blocks>"
    ),
    "pl-sketch": '<pl-sketch answers-name="a" {weight}></pl-sketch>',
    "pl-string-input": '<pl-string-input answers-name="a" correct-answer="x" {weight}></pl-string-input>',
    "pl-symbolic-input": (
        '<pl-symbolic-input answers-name="a" correct-answer="x" variables="x" {weight}>'
        "</pl-symbolic-input>"
    ),
    "pl-units-input": '<pl-units-input answers-name="a" correct-answer="1 m" {weight}></pl-units-input>',
}


SKETCH_CRITERION_HTML = (
    '<pl-sketch answers-name="a">'
    '<pl-sketch-tool id="point" type="point"></pl-sketch-tool>'
    '<pl-sketch-grade type="match" tool-id="point" x="0" y="0" {weight}></pl-sketch-grade>'
    "</pl-sketch>"
)


def prepare_element(
    element_name: str,
    html: str,
    question_data: QuestionData,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Import the element from its own directory and run its `prepare()`."""
    monkeypatch.syspath_prepend(str(ELEMENTS_DIR / element_name))
    element = importlib.import_module(element_name)
    element.prepare(html, question_data)


@pytest.mark.parametrize("element_name", sorted(ELEMENT_HTML))
def test_negative_weight_is_rejected(
    element_name: str, question_data: QuestionData, monkeypatch: pytest.MonkeyPatch
) -> None:
    html = ELEMENT_HTML[element_name].format(weight='weight="-1"')
    with pytest.raises(
        ValueError, match='Attribute "weight" must be a non-negative integer, not -1'
    ):
        prepare_element(element_name, html, question_data, monkeypatch)


@pytest.mark.parametrize("element_name", sorted(ELEMENT_HTML))
@pytest.mark.parametrize("weight_attrib", ["", 'weight="0"', 'weight="3"'])
def test_non_negative_weight_is_accepted(
    element_name: str,
    weight_attrib: str,
    question_data: QuestionData,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    html = ELEMENT_HTML[element_name].format(weight=weight_attrib)
    prepare_element(element_name, html, question_data, monkeypatch)


def test_negative_sketch_criterion_weight_is_rejected(
    question_data: QuestionData, monkeypatch: pytest.MonkeyPatch
) -> None:
    html = SKETCH_CRITERION_HTML.format(weight='weight="-1"')
    with pytest.raises(
        ValueError,
        match='Attribute "weight" of a grading criterion must be a non-negative integer, not -1',
    ):
        prepare_element("pl-sketch", html, question_data, monkeypatch)


@pytest.mark.parametrize("weight_attrib", ["", 'weight="0"', 'weight="3"'])
def test_non_negative_sketch_criterion_weight_is_accepted(
    weight_attrib: str, question_data: QuestionData, monkeypatch: pytest.MonkeyPatch
) -> None:
    html = SKETCH_CRITERION_HTML.format(weight=weight_attrib)
    prepare_element("pl-sketch", html, question_data, monkeypatch)
