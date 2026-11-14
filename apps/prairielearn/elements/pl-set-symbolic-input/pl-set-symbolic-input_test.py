import importlib
from pathlib import Path
from typing import Any

import prairielearn.sympy_utils as psu
import pytest
import sympy

set_symbolic_input = importlib.import_module("pl-set-symbolic-input")


def build_element_html(*attributes: str, answers_name: str = "test") -> str:
    return "\n".join([
        "<pl-set-symbolic-input",
        f'    answers-name="{answers_name}"',
        *[f"    {attribute}" for attribute in attributes],
        "></pl-set-symbolic-input>",
    ])


def make_question_data(
    *,
    submitted_answers: dict[str, Any] | None = None,
    raw_submitted_answers: dict[str, Any] | None = None,
    correct_answers: dict[str, Any] | None = None,
    panel: str = "question",
    editable: bool = True,
) -> dict[str, Any]:
    submitted_answers = submitted_answers or {}
    return {
        "submitted_answers": submitted_answers,
        "raw_submitted_answers": (
            raw_submitted_answers
            if raw_submitted_answers is not None
            else submitted_answers.copy()
        ),
        "correct_answers": correct_answers or {},
        "answers_names": {},
        "format_errors": {},
        "partial_scores": {},
        "panel": panel,
        "editable": editable,
    }


@pytest.mark.parametrize(
    ("submission", "expected"),
    [
        ("R", sympy.S.Reals),
        ("Q", sympy.S.Rationals),
        ("Z", sympy.S.Integers),
        ("N", sympy.S.Naturals),
        ("C", sympy.S.Complexes),
    ],
)
def test_named_sets_parse_and_grade(submission: str, expected: sympy.Set) -> None:
    element_html = build_element_html(f'correct-answer="{submission}"')
    data = make_question_data(submitted_answers={"test": submission})

    set_symbolic_input.prepare(element_html, data)
    set_symbolic_input.parse(element_html, data)
    set_symbolic_input.grade(element_html, data)

    assert "test" not in data["format_errors"]
    assert (
        psu.json_to_sympy(data["submitted_answers"]["test"], allow_sets=True)
        is expected
    )
    assert data["partial_scores"]["test"]["score"] == 1


def test_set_operations_grade_by_symbolic_equivalence() -> None:
    element_html = build_element_html('correct-answer="R - {0}"', 'syntax="interval"')
    data = make_question_data(submitted_answers={"test": "(-infty, 0) U (0, infty)"})

    set_symbolic_input.prepare(element_html, data)
    set_symbolic_input.parse(element_html, data)
    set_symbolic_input.grade(element_html, data)

    assert data["partial_scores"]["test"]["score"] == 1


def test_tuple_members_grade_by_component_equivalence() -> None:
    element_html = build_element_html(
        'correct-answer="{(x * (x + 1), y + 1)}"', 'variables="x, y"'
    )
    data = make_question_data(submitted_answers={"test": "{(x^2 + x, 1 + y)}"})

    set_symbolic_input.prepare(element_html, data)
    set_symbolic_input.parse(element_html, data)
    set_symbolic_input.grade(element_html, data)

    submitted = psu.json_to_sympy(data["submitted_answers"]["test"], allow_sets=True)
    assert submitted == sympy.FiniteSet(
        sympy.Tuple(sympy.Symbol("x") ** 2 + sympy.Symbol("x"), sympy.Symbol("y") + 1)
    )
    assert data["partial_scores"]["test"]["score"] == 1


@pytest.mark.parametrize(
    "submission",
    [
        "x + 1",
        "Interval(0, 1)",
        "Tuple(1, 2)",
        "FiniteSet(1)",
        "Reals",
        "sympy.S.Reals",
    ],
)
def test_rejects_non_set_and_constructor_syntax(submission: str) -> None:
    element_html = build_element_html('variables="x"')
    data = make_question_data(submitted_answers={"test": submission})

    set_symbolic_input.parse(element_html, data)

    assert data["submitted_answers"]["test"] is None
    assert "test" in data["format_errors"]


@pytest.mark.parametrize("attribute", ['variables="R"', 'custom-functions="Q"'])
def test_named_set_names_are_reserved(attribute: str) -> None:
    element_html = build_element_html(attribute)
    data = make_question_data()

    with pytest.raises(ValueError, match="Named sets cannot be used"):
        set_symbolic_input.prepare(element_html, data)


def test_blank_defaults_to_empty_set() -> None:
    element_html = build_element_html('allow-blank="true"', 'correct-answer="{}"')
    data = make_question_data(submitted_answers={"test": ""})

    set_symbolic_input.prepare(element_html, data)
    set_symbolic_input.parse(element_html, data)
    set_symbolic_input.grade(element_html, data)

    submitted = psu.json_to_sympy(data["submitted_answers"]["test"], allow_sets=True)
    assert submitted is sympy.S.EmptySet
    assert data["partial_scores"]["test"]["score"] == 1


def test_rejects_unrepresentable_correct_answer() -> None:
    correct_answer = psu.sympy_to_json(sympy.Range(5), allow_sets=True)
    element_html = build_element_html()
    data = make_question_data(correct_answers={"test": correct_answer})

    with pytest.raises(ValueError, match="Correct answer"):
        set_symbolic_input.prepare(element_html, data)


@pytest.mark.parametrize(
    ("attributes", "correct_answer"),
    [
        ([], sympy.FiniteSet(sympy.Tuple(1, 2), sympy.Tuple(3, 4))),
        (['syntax="interval"'], sympy.Interval.Ropen(0, 1)),
    ],
)
def test_accepts_programmatic_correct_answer_for_selected_syntax(
    attributes: list[str], correct_answer: sympy.Set
) -> None:
    element_html = build_element_html(*attributes)
    data = make_question_data(
        correct_answers={
            "test": psu.sympy_to_json(correct_answer, allow_sets=True),
        }
    )

    set_symbolic_input.prepare(element_html, data)


@pytest.mark.parametrize(
    ("attributes", "correct_answer"),
    [
        ([], sympy.Interval.Ropen(0, 1)),
        (['syntax="interval"'], sympy.FiniteSet(sympy.Tuple(1, 2))),
    ],
)
def test_rejects_programmatic_correct_answer_for_other_syntax(
    attributes: list[str], correct_answer: sympy.Set
) -> None:
    element_html = build_element_html(*attributes)
    data = make_question_data(
        correct_answers={
            "test": psu.sympy_to_json(correct_answer, allow_sets=True),
        }
    )

    with pytest.raises(ValueError, match="Correct answer"):
        set_symbolic_input.prepare(element_html, data)


def test_default_tuple_syntax_rejects_interval_notation() -> None:
    element_html = build_element_html()
    data = make_question_data(submitted_answers={"test": "[0, 1]"})

    set_symbolic_input.parse(element_html, data)

    assert data["submitted_answers"]["test"] is None
    assert "Interval notation is not allowed" in data["format_errors"]["test"]


def test_generated_tuple_submission_can_be_parsed_and_graded() -> None:
    correct_answer = psu.sympy_to_json(
        sympy.FiniteSet(sympy.Tuple(1, 2), sympy.Tuple(3, 4)), allow_sets=True
    )
    element_html = build_element_html()
    data = make_question_data(correct_answers={"test": correct_answer})
    data["test_type"] = "correct"

    set_symbolic_input.prepare(element_html, data)
    set_symbolic_input.test(element_html, data)

    data["submitted_answers"] = data["raw_submitted_answers"].copy()
    set_symbolic_input.parse(element_html, data)
    set_symbolic_input.grade(element_html, data)

    assert data["format_errors"] == {}
    assert data["partial_scores"]["test"]["score"] == 1


def test_schema_rejects_general_symbolic_set_attributes() -> None:
    data = make_question_data()
    for attribute in [
        'allow-sets="true"',
        'allowed-types="interval"',
        'additional-simplifications="expand"',
    ]:
        with pytest.raises(Exception, match="attribute"):
            set_symbolic_input.prepare(build_element_html(attribute), data)


def test_formula_editor_renders_named_set_keyboard_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    element_html = build_element_html(
        'formula-editor="true"',
        'correct-answer="R - {0}"',
        'initial-value="R"',
    )
    data = make_question_data()

    set_symbolic_input.prepare(element_html, data)
    rendered = set_symbolic_input.render(element_html, data)

    assert 'allow-sets="allow-sets"' in rendered
    assert 'named-sets="named-sets"' in rendered
    assert 'set-syntax="tuple"' in rendered
    assert "Tuples may be used as set members" in rendered
    assert "intervals are not available" in rendered
    assert "\\mathbb{R}" in rendered


def test_formula_editor_renders_interval_keyboard_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    element_html = build_element_html(
        'formula-editor="true"',
        'correct-answer="[0, 1)"',
        'syntax="interval"',
    )
    data = make_question_data()

    set_symbolic_input.prepare(element_html, data)
    rendered = set_symbolic_input.render(element_html, data)

    assert 'set-syntax="interval"' in rendered
    assert "tuples are not available" in rendered


def test_answer_panel_renders_named_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    element_html = build_element_html('correct-answer="C"')
    data = make_question_data(panel="answer", editable=False)
    set_symbolic_input.prepare(element_html, data)

    rendered = set_symbolic_input.render(element_html, data)

    assert "\\mathbb{C}" in rendered
