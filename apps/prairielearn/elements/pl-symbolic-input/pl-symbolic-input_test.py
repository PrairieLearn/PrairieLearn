import importlib
import string
from pathlib import Path
from typing import Any

import prairielearn.sympy_utils as psu
import pytest
import sympy

symbolic_input = importlib.import_module("pl-symbolic-input")


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
    ("sub", "allow_trig", "variables", "custom_functions", "expected"),
    [
        # Greek letters
        ("Α", False, ["Α"], [], " Alpha "),  # noqa: RUF001
        ("ΑΑ0Α0ΑΑ", False, ["Α", "Α0"], [], " Alpha  Alpha0 Alpha0 Alpha  Alpha "),  # noqa: RUF001
        (
            "t h e t a s i n t h e t a c o s t h e t a",
            True,
            ["theta"],
            [],
            "theta sin theta cos theta",
        ),
        (
            "a b a b l a b l a b l a a b l a",
            False,
            ["bla", "abla", "ab"],
            [],
            "ab abla bla bla abla",
        ),
        (  # Overlapping-match test
            "a b a b",
            False,
            ["ab", "aba"],
            [],
            "aba b",
        ),
        (  # Longer-match test
            "a b c a b d",
            False,
            ["ab", "abc"],
            [],
            "abc ab d",
        ),
        (  # Performance test
            "a b " * 1000,
            False,
            ["ab", *list(string.ascii_lowercase)[2:]],
            [],
            "ab " * 1000,
        ),
        # Trig functions
        ("s i n ( x )", True, ["x"], [], "sin ( x )"),
        ("s i n h ( s i n x )", True, ["x"], [], "sinh ( sin x )"),
        ("s i n ( x )", False, ["x"], [], "s i n ( x )"),
        ("s i n ( Α )", False, ["Α"], [], "s i n (  Alpha  )"),  # noqa: RUF001
        # Variables
        ("t i m e + x", True, ["time", "x"], [], "time + x"),
        # Prefix test
        ("a c o s h ( a c o s ( x ) )", True, ["x"], [], "acosh ( acos ( x ) )"),
        # Number spacing
        ("x2+x10", False, ["x"], [], "x 2+x 10"),
        ("e^x2", False, ["x"], [], "e^x 2"),
        # Custom functions
        ("m y f u n ( x )", False, ["x"], ["myfun"], "myfun ( x )"),
        ("f2(x) + x2", False, ["x"], ["f2"], "f2(x) + x 2"),
        ("Α(x) + x2", False, ["x"], ["Α"], " Alpha (x) + x 2"),  # noqa: RUF001
        ("x2 + x2 + f2(x)", False, ["x"], ["f2"], "x 2 + x 2 + f2(x)"),
        # Formatting operators
        ("{:s i n ( x ):}", True, ["x"], [], "sin ( x )"),
    ],
)
def test_format_formula_editor_submission_for_sympy(
    sub: str,
    allow_trig: bool,
    variables: list[str],
    custom_functions: list[str],
    expected: str,
) -> None:
    out = symbolic_input.format_formula_editor_submission_for_sympy(
        sub, allow_trig, variables, custom_functions
    )
    assert out == expected


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
    element_html = '<pl-symbolic-input answers-name="test"></pl-symbolic-input>'

    # Create mock data structure (simulating what the system passes to parse)
    data: dict[str, Any] = {
        "submitted_answers": {"test": "x + y"},
        "raw_submitted_answers": {"test": "x + y"},
        "correct_answers": {"test": correct_json},
        "format_errors": {},
        "partial_scores": {},
    }

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

    Previously, evaluateFalse kept sqrt(-2) unevaluated as Pow(-2, 1/2), so the
    imaginary unit I never appeared in the expression tree and sympy_check didn't
    detect it. The submission passed parse but then crashed during grading when
    json_to_sympy re-evaluated with simplification enabled.
    """
    correct_answer = psu.sympy_to_json(sympy.Integer(42))

    element_html = """
    <pl-symbolic-input
        answers-name="test"
        variables="x"
        display-simplified-expression="false"
    ></pl-symbolic-input>
    """

    data: dict[str, Any] = {
        "submitted_answers": {"test": a_sub},
        "raw_submitted_answers": {"test": a_sub},
        "correct_answers": {"test": correct_answer},
        "format_errors": {},
        "partial_scores": {},
    }

    symbolic_input.parse(element_html, data)

    assert "test" in data["format_errors"]
    assert "complex number" in data["format_errors"]["test"]


def test_implicit_complex_grade_does_not_crash() -> None:
    """If an implicitly complex submission somehow reaches grading, it must
    produce a format error instead of an unhandled HasComplexError.

    This tests the safety net in the grade function that catches HasComplexError.
    """
    correct_answer = psu.sympy_to_json(sympy.Integer(42))
    # Simulate a submission that passed parse and was stored as sympy JSON.
    # Use a value string that will produce I when re-evaluated with simplification.
    submitted_answer: psu.SympyJson = {
        "_type": "sympy",
        "_value": "sqrt(-2)",
        "_variables": [],
    }

    element_html = """
    <pl-symbolic-input
        answers-name="test"
        variables="x"
    ></pl-symbolic-input>
    """

    data: dict[str, Any] = {
        "submitted_answers": {"test": submitted_answer},
        "raw_submitted_answers": {"test": "sqrt(-2)"},
        "correct_answers": {"test": correct_answer},
        "format_errors": {},
        "partial_scores": {},
    }

    # This must not raise HasComplexError
    symbolic_input.grade(element_html, data)

    assert "test" in data["format_errors"]
    assert "complex number" in data["format_errors"]["test"].lower()


def test_formula_editor_initial_value_respects_display_log_as_ln(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    element_html = """
    <pl-symbolic-input
        answers-name="test"
        variables="x"
        formula-editor="true"
        display-log-as-ln="true"
        initial-value="log(x)"
    ></pl-symbolic-input>
    """
    data: dict[str, Any] = {
        "submitted_answers": {},
        "raw_submitted_answers": {},
        "correct_answers": {},
        "answers_names": {},
        "format_errors": {},
        "partial_scores": {},
        "panel": "question",
        "editable": True,
    }

    symbolic_input.prepare(element_html, data)
    rendered = symbolic_input.render(element_html, data)

    assert "\\ln{\\left(x \\right)}" in rendered
    assert "\\log{\\left(x \\right)}" not in rendered
