import importlib
import string
from pathlib import Path
from typing import Any

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
