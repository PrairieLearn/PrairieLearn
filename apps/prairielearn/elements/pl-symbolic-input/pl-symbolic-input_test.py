import importlib
from pathlib import Path
from typing import Any, cast

import prairielearn.sympy_utils as psu
import pytest
import sympy

symbolic_input = importlib.import_module("pl-symbolic-input")


def build_element_html(*attributes: str, answers_name: str = "test") -> str:
    return "\n".join([
        "<pl-symbolic-input",
        f'    answers-name="{answers_name}"',
        *[f"    {attribute}" for attribute in attributes],
        "></pl-symbolic-input>",
    ])


def make_question_data(
    *,
    submitted_answers: dict[str, Any] | None = None,
    raw_submitted_answers: dict[str, Any] | None = None,
    correct_answers: dict[str, Any] | None = None,
    answers_names: dict[str, Any] | None = None,
    panel: str = "question",
    editable: bool = True,
) -> dict[str, Any]:
    submitted_answers = submitted_answers or {}
    return {
        "submitted_answers": submitted_answers,
        "raw_submitted_answers": (
            raw_submitted_answers
            if raw_submitted_answers is not None
            else submitted_answers
        ),
        "correct_answers": correct_answers or {},
        "answers_names": answers_names or {},
        "format_errors": {},
        "partial_scores": {},
        "panel": panel,
        "editable": editable,
    }


@pytest.mark.parametrize(
    ("sub", "expected"),
    [
        ("|x|", "abs(x)"),
        ("||x|+y|", "abs(abs(x)+y)"),
        ("|a| + |b|", "abs(a) + abs(b)"),
        ("|||x|||", "abs(abs(abs(x)))"),
        ("x+y", "x+y"),
        ("|x+2|", "abs(x+2)"),
        ("|-x+2|", "abs(-x+2)"),
        ("|x!|", "abs(x!)"),
        ("|+4|", "abs(+4)"),
        ("|x + |y||", "abs(x + abs(y))"),
        ("|x+|-x+1+2+3+4||", "abs(x+abs(-x+1+2+3+4))"),
        ("|x+|x+1+2+3+4 ||", "abs(x+abs(x+1+2+3+4 ))"),
        ("", ""),
    ],
)
def test_format_submission_for_sympy_absolute_value(sub: str, expected: str) -> None:
    out, error_msg = symbolic_input.format_submission_for_sympy(sub)
    assert (out, error_msg) == (expected, None)


@pytest.mark.parametrize(
    ("sub", "expected"),
    [
        ("{1} | {2}", "{1} | {2}"),
        ("{1, 2} | {3}", "{1, 2} | {3}"),
        ("[1, 2] | [3, 4]", "[1, 2] | [3, 4]"),
        ("|x| | {1}", "abs(x) | {1}"),
        ("[0,1] | (2,3) | [4,5]", "[0,1] | (2,3) | [4,5]"),
        ("(0,1) | (2,3)", "(0,1) | (2,3)"),
        ("{1} | (2,3) | [4,5]", "{1} | (2,3) | [4,5]"),
    ],
)
def test_format_submission_for_sympy_preserves_set_union(
    sub: str, expected: str
) -> None:
    out, error_msg = symbolic_input.format_submission_for_sympy(sub, allow_sets=True)
    assert (out, error_msg) == (expected, None)


def test_set_union_submission_parses_when_set_notation_is_enabled() -> None:
    element_html = build_element_html(
        'allow-sets="true"',
        'correct-answer="{1} | {2}"',
    )
    data = make_question_data(submitted_answers={"test": "{1} | {2}"})

    symbolic_input.prepare(element_html, data)
    symbolic_input.parse(element_html, data)

    assert "test" not in data["format_errors"]
    assert isinstance(data["submitted_answers"]["test"], dict)
    assert psu.json_to_sympy(
        data["submitted_answers"]["test"], allow_sets=True
    ) == sympy.FiniteSet(1, 2)


def test_parse_without_variables_attribute_with_assumptions() -> None:
    """Test that parse works when no variables attribute is specified but correct answer has assumptions.

    This is a regression test for https://github.com/PrairieLearn/PrairieLearn/issues/12053
    where using pl-symbolic-input without a variables attribute would fail with
    HasInvalidAssumptionError when the correct answer had variable assumptions.
    """
    # Create a sympy expression with assumptions (like an instructor would in server.py)
    x = sympy.Symbol("x", real=True)
    y = sympy.Symbol("y", real=True)
    correct_expr = x + y

    # Convert to JSON (this is what gets stored and later retrieved)
    correct_json = psu.sympy_to_json(correct_expr)

    # Simulate element HTML without variables attribute
    element_html = build_element_html()

    # Create mock data structure (simulating what the system passes to parse)
    data = make_question_data(
        submitted_answers={"test": "x + y"},
        correct_answers={"test": correct_json},
    )

    # This should NOT raise HasInvalidAssumptionError
    symbolic_input.parse(element_html, data)

    # Verify the submission was parsed successfully
    assert "test" not in data["format_errors"]
    assert data["submitted_answers"]["test"] is not None
    # The submitted answer should be a valid SympyJson dict
    assert isinstance(data["submitted_answers"]["test"], dict)
    assert data["submitted_answers"]["test"]["_type"] == "sympy"


@pytest.mark.parametrize("a_sub", ["sqrt(-2)", "sqrt(-1)", "(-2)^(1/2)"])
def test_implicit_complex_rejected_with_no_simplify(a_sub: str) -> None:
    """Submitting an implicitly complex expression like sqrt(-2) must produce a
    format error during parse, even when display-simplified-expression is false.
    """
    correct_answer = psu.sympy_to_json(sympy.Integer(42))

    element_html = build_element_html(
        'variables="x"', 'display-simplified-expression="false"'
    )

    data = make_question_data(
        submitted_answers={"test": a_sub},
        correct_answers={"test": correct_answer},
    )

    symbolic_input.parse(element_html, data)

    assert "test" in data["format_errors"]
    assert "complex number" in data["format_errors"]["test"]


@pytest.mark.parametrize("a_sub", ["log(-x^2)", "sqrt(-x^2)"])
def test_complex_from_real_assumptions_produces_format_error(a_sub: str) -> None:
    """When a correct answer has real variable assumptions, submitting an
    expression that becomes complex (e.g. log(-x^2)) should produce a format
    error, not an unhandled exception.

    Regression test for https://github.com/PrairieLearn/PrairieLearn/issues/14442
    """
    x = sympy.Symbol("x", real=True)
    correct_answer = psu.sympy_to_json(x ** (-1) - 1)

    element_html = build_element_html('variables="x"')

    data = make_question_data(
        submitted_answers={"test": a_sub},
        correct_answers={"test": correct_answer},
    )

    symbolic_input.parse(element_html, data)

    assert "test" in data["format_errors"]
    assert "complex number" in data["format_errors"]["test"]


@pytest.mark.parametrize(
    "a_sub",
    [
        "sec(0)",
        "(16-9*(sec(0)^2))/3",
        "csc(1)",
    ],
)
def test_trig_no_crash_with_no_simplify(a_sub: str) -> None:
    """Submitting expressions with sec/csc must not crash when
    display-simplified-expression is false. Regression test for a sympy
    bug where is_extended_real on unevaluated sec(0) raises AttributeError.
    """
    correct_answer = psu.sympy_to_json(sympy.Integer(2))

    element_html = build_element_html(
        'variables="x"', 'display-simplified-expression="false"'
    )

    data = make_question_data(
        submitted_answers={"test": a_sub},
        correct_answers={"test": correct_answer},
    )

    symbolic_input.parse(element_html, data)

    assert "test" not in data["format_errors"], (
        f"Unexpected format error: {data['format_errors'].get('test')}"
    )
    assert data["submitted_answers"]["test"] is not None


def test_formula_editor_initial_value_respects_display_log_as_ln(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    element_html = build_element_html(
        'variables="x"',
        'formula-editor="true"',
        'display-log-as-ln="true"',
        'initial-value="log(x)"',
    )
    data = make_question_data()

    symbolic_input.prepare(element_html, data)
    rendered = symbolic_input.render(element_html, data)

    assert "\\ln{\\left(x \\right)}" in rendered
    assert "\\log{\\left(x \\right)}" not in rendered


def test_formula_editor_test_submission_includes_mathjson() -> None:
    x = sympy.Symbol("x")
    # pyright is not smart enough here
    expected = cast(
        sympy.Basic, sympy.Function("test")(sympy.sqrt(sympy.exp(x) / x**2))
    )
    element_html = build_element_html(
        'formula-editor="true"',
        'variables="x"',
        'custom-functions="test"',
    )
    data = make_question_data(correct_answers={"test": psu.sympy_to_json(expected)})
    data["test_type"] = "correct"

    symbolic_input.test(element_html, data)

    raw_submitted_answers = data["raw_submitted_answers"]
    assert raw_submitted_answers["test"] == str(expected)
    assert isinstance(raw_submitted_answers["test-json"], str)

    parse_data = make_question_data(
        submitted_answers=raw_submitted_answers,
        correct_answers={"test": psu.sympy_to_json(expected)},
    )
    symbolic_input.parse(element_html, parse_data)

    assert "test" not in parse_data["format_errors"]
    assert (
        psu.json_to_sympy(parse_data["submitted_answers"]["test"], allow_sets=True)
        == expected
    )


def test_mathjson_submission_reapplies_variable_checks() -> None:
    element_html = build_element_html('variables="x"')
    data = make_question_data(submitted_answers={"test": "y", "test-json": '"y"'})

    symbolic_input.parse(element_html, data)

    assert "test" in data["format_errors"]
    assert data["submitted_answers"]["test"] is None


def test_mathjson_submission_reapplies_custom_function_checks() -> None:
    element_html = build_element_html('variables="x"')
    data = make_question_data(
        submitted_answers={"test": "f(x)", "test-json": '["Apply", "f", "x"]'}
    )

    symbolic_input.parse(element_html, data)

    assert "test" in data["format_errors"]
    assert data["submitted_answers"]["test"] is None


def test_mathjson_student_errors_are_shown_directly() -> None:
    element_html = build_element_html('allow-sets="true"')
    data = make_question_data(
        submitted_answers={"test": "{1} + 2", "test-json": '["Add", ["Set", 1], 2]'}
    )

    symbolic_input.parse(element_html, data)

    assert (
        data["format_errors"]["test"] == "Parse error: Expected a numeric expression."
    )
    assert data["submitted_answers"]["test"] is None


def test_unexpected_mathjson_composition_errors_use_generic_message() -> None:
    element_html = build_element_html('variables="x"')
    data = make_question_data(
        submitted_answers={"test": "x", "test-json": '["Rational", "x"]'}
    )

    symbolic_input.parse(element_html, data)

    assert data["format_errors"]["test"] == (
        "Parse error: Could not parse submitted answer."
    )
    assert "invalid input" not in data["format_errors"]["test"]
    assert data["submitted_answers"]["test"] is None


def test_mathjson_submission_respects_blank_value() -> None:
    element_html = build_element_html('allow-blank="true"', 'blank-value="0"')
    data = make_question_data(submitted_answers={"test": "", "test-json": '"x"'})

    symbolic_input.parse(element_html, data)

    assert "test" not in data["format_errors"]
    assert psu.json_to_sympy(data["submitted_answers"]["test"]) == 0


def test_formula_editor_set_test_submission_includes_mathjson() -> None:
    expected = sympy.Union(
        sympy.Interval(-sympy.oo, sympy.Rational(-1, 2)),
        sympy.Interval(sympy.Rational(1, 2), sympy.oo),
    )
    element_html = build_element_html(
        'formula-editor="true"',
        'allow-sets="true"',
        'correct-answer="(-infty, -1/2] U [1/2, infty)"',
    )
    data = make_question_data()
    data["test_type"] = "correct"

    symbolic_input.prepare(element_html, data)
    symbolic_input.test(element_html, data)

    raw_submitted_answers = data["raw_submitted_answers"]
    assert raw_submitted_answers["test"] == str(expected)
    assert isinstance(raw_submitted_answers["test-json"], str)

    parse_data = make_question_data(
        submitted_answers=raw_submitted_answers,
        correct_answers=data["correct_answers"],
    )
    symbolic_input.parse(element_html, parse_data)

    assert "test" not in parse_data["format_errors"]
    assert (
        psu.json_to_sympy(parse_data["submitted_answers"]["test"], allow_sets=True)
        == expected
    )


@pytest.mark.parametrize(
    ("answer", "expected_expr"),
    [
        (
            "[sin(x), cos(y)]",
            sympy.Interval(sympy.sin(sympy.Symbol("x")), sympy.cos(sympy.Symbol("y"))),
        ),
        (
            "[x^2 + 2*x - 1, y^2 - 3*y + 4]",
            sympy.Interval(
                sympy.Symbol("x") ** 2 + 2 * sympy.Symbol("x") - 1,
                sympy.Symbol("y") ** 2 - 3 * sympy.Symbol("y") + 4,
            ),
        ),
    ],
)
def test_interval_endpoints_support_trig_and_arithmetic_expressions(
    answer: str, expected_expr: sympy.Basic
) -> None:
    element_html = build_element_html(
        'allow-sets="true"',
        'variables="x,y"',
        f'correct-answer="{answer}"',
    )
    data = make_question_data(submitted_answers={"test": answer})

    symbolic_input.prepare(element_html, data)
    assert data["correct_answers"]["test"] == answer

    symbolic_input.parse(element_html, data)
    assert "test" not in data["format_errors"]
    assert isinstance(data["submitted_answers"]["test"], dict)
    assert data["submitted_answers"]["test"]["_type"] == "sympy"
    assert (
        psu.json_to_sympy(data["submitted_answers"]["test"], allow_sets=True)
        == expected_expr
    )

    symbolic_input.grade(element_html, data)
    assert data["partial_scores"]["test"]["score"] == 1


def test_interval_correct_answer_renders(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    element_html = build_element_html(
        'allow-sets="true"',
        'correct-answer="[1, 2] U [3, 4]"',
    )
    data = make_question_data(panel="answer", editable=False)

    symbolic_input.prepare(element_html, data)
    rendered = symbolic_input.render(element_html, data)

    assert "\\left[1, 2\\right] \\cup \\left[3, 4\\right]" in rendered


def test_empty_set_submission_round_trips_when_set_notation_is_enabled() -> None:
    element_html = build_element_html(
        'allow-sets="true"',
        'correct-answer="{}"',
    )
    data = make_question_data(submitted_answers={"test": "{}"})

    symbolic_input.prepare(element_html, data)
    symbolic_input.parse(element_html, data)

    assert "test" not in data["format_errors"]
    assert isinstance(data["submitted_answers"]["test"], dict)
    assert (
        psu.json_to_sympy(data["submitted_answers"]["test"], allow_sets=True)
        == sympy.EmptySet
    )

    symbolic_input.grade(element_html, data)
    assert data["partial_scores"]["test"]["score"] == 1


def test_additional_simplifications_cannot_be_used_with_set_notation() -> None:
    element_html = build_element_html(
        'allow-sets="true"',
        'additional-simplifications="expand"',
        'correct-answer="1"',
    )
    data = make_question_data(submitted_answers={"test": "1"})

    with pytest.raises(
        ValueError, match=(r"'additional-simplifications'.*'allow-sets'")
    ):
        symbolic_input.prepare(element_html, data)
