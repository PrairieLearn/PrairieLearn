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
    where using pl-symbolic-interval without a variables attribute would fail with
    HasInvalidAssumptionError when the correct answer had variable assumptions.
    """
    # Create a sympy expression with assumptions (like an instructor would in server.py)
    x = sympy.Symbol("x", real=True)
    y = sympy.Symbol("y", real=True)
    correct_expr = x + y

    # Convert to JSON (this is what gets stored and later retrieved)
    correct_json = psu.sympy_to_json(correct_expr)

    # Simulate element HTML without variables attribute
    element_html = '<pl-symbolic-interval answers-name="test"></pl-symbolic-interval>'

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
    """
    correct_answer = psu.sympy_to_json(sympy.Integer(42))

    element_html = """
    <pl-symbolic-interval
        answers-name="test"
        variables="x"
        display-simplified-expression="false"
    ></pl-symbolic-interval>
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


@pytest.mark.parametrize("a_sub", ["log(-x^2)", "sqrt(-x^2)"])
def test_complex_from_real_assumptions_produces_format_error(a_sub: str) -> None:
    """When a correct answer has real variable assumptions, submitting an
    expression that becomes complex (e.g. log(-x^2)) should produce a format
    error, not an unhandled exception.

    Regression test for https://github.com/PrairieLearn/PrairieLearn/issues/14442
    """
    x = sympy.Symbol("x", real=True)
    correct_answer = psu.sympy_to_json(x ** (-1) - 1)

    element_html = """
    <pl-symbolic-interval
        answers-name="test"
        variables="x"
    ></pl-symbolic-interval>
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

    element_html = """
    <pl-symbolic-interval
        answers-name="test"
        variables="x"
        display-simplified-expression="false"
    ></pl-symbolic-interval>
    """

    data: dict[str, Any] = {
        "submitted_answers": {"test": a_sub},
        "raw_submitted_answers": {"test": a_sub},
        "correct_answers": {"test": correct_answer},
        "format_errors": {},
        "partial_scores": {},
    }

    symbolic_input.parse(element_html, data)

    assert "test" not in data["format_errors"], (
        f"Unexpected format error: {data['format_errors'].get('test')}"
    )
    assert data["submitted_answers"]["test"] is not None


def test_formula_editor_initial_value_respects_display_log_as_ln(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    element_html = """
    <pl-symbolic-interval
        answers-name="test"
        variables="x"
        formula-editor="true"
        display-log-as-ln="true"
        initial-value="log(x)"
    ></pl-symbolic-interval>
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


def test_open_interval_submission_parses_and_grades() -> None:
    element_html = """
    <pl-symbolic-interval
        answers-name="test"
        allow-set-notation="true"
        correct-answer="(1, 2] U (3, 4)"
    ></pl-symbolic-interval>
    """
    data: dict[str, Any] = {
        "submitted_answers": {"test": "(1, 2] U (3, 4)"},
        "raw_submitted_answers": {"test": "(1, 2] U (3, 4)"},
        "correct_answers": {},
        "answers_names": {},
        "format_errors": {},
        "partial_scores": {},
        "panel": "question",
        "editable": True,
    }

    symbolic_input.prepare(element_html, data)
    assert data["correct_answers"]["test"] == "(1, 2] U (3, 4)"

    symbolic_input.parse(element_html, data)
    assert "test" not in data["format_errors"]
    assert isinstance(data["submitted_answers"]["test"], dict)
    assert data["submitted_answers"]["test"]["_type"] == "sympy"
    assert (
        data["submitted_answers"]["test"]["_value"]
        == "Union(Interval(1, 2, True, False), Interval(3, 4, True, True))"
    )

    symbolic_input.grade(element_html, data)
    assert data["partial_scores"]["test"]["score"] == 1


def test_closed_interval_submission_parses_and_grades() -> None:
    element_html = """
    <pl-symbolic-interval
        answers-name="test"
        allow-set-notation="true"
        correct-answer="[1, 2] U [3, 4]"
    ></pl-symbolic-interval>
    """
    data: dict[str, Any] = {
        "submitted_answers": {"test": "[1, 2] U [3, 4]"},
        "raw_submitted_answers": {"test": "[1, 2] U [3, 4]"},
        "correct_answers": {},
        "answers_names": {},
        "format_errors": {},
        "partial_scores": {},
        "panel": "question",
        "editable": True,
    }

    symbolic_input.prepare(element_html, data)
    assert data["correct_answers"]["test"] == "[1, 2] U [3, 4]"

    symbolic_input.parse(element_html, data)
    assert "test" not in data["format_errors"]
    assert isinstance(data["submitted_answers"]["test"], dict)
    assert data["submitted_answers"]["test"]["_type"] == "sympy"
    assert (
        data["submitted_answers"]["test"]["_value"]
        == "Union(Interval(1, 2), Interval(3, 4))"
    )

    symbolic_input.grade(element_html, data)
    assert data["partial_scores"]["test"]["score"] == 1


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
    element_html = f"""
    <pl-symbolic-interval
        answers-name="test"
        allow-set-notation="true"
        variables="x,y"
        correct-answer="{answer}"
    ></pl-symbolic-interval>
    """
    data: dict[str, Any] = {
        "submitted_answers": {"test": answer},
        "raw_submitted_answers": {"test": answer},
        "correct_answers": {},
        "answers_names": {},
        "format_errors": {},
        "partial_scores": {},
        "panel": "question",
        "editable": True,
    }

    symbolic_input.prepare(element_html, data)
    assert data["correct_answers"]["test"] == answer

    symbolic_input.parse(element_html, data)
    assert "test" not in data["format_errors"]
    assert isinstance(data["submitted_answers"]["test"], dict)
    assert data["submitted_answers"]["test"]["_type"] == "sympy"
    assert sympy.sympify(data["submitted_answers"]["test"]["_value"]) == expected_expr

    symbolic_input.grade(element_html, data)
    assert data["partial_scores"]["test"]["score"] == 1


def test_interval_correct_answer_renders(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    element_html = """
    <pl-symbolic-interval
        answers-name="test"
        allow-set-notation="true"
        correct-answer="[1, 2] U [3, 4]"
    ></pl-symbolic-interval>
    """
    data: dict[str, Any] = {
        "submitted_answers": {},
        "raw_submitted_answers": {},
        "correct_answers": {},
        "answers_names": {},
        "format_errors": {},
        "partial_scores": {},
        "panel": "answer",
        "editable": False,
    }

    symbolic_input.prepare(element_html, data)
    rendered = symbolic_input.render(element_html, data)

    assert "\\left[1, 2\\right]" in rendered


def test_closed_interval_literal_parses() -> None:
    out = psu.try_parse_string_as_sympy("[1, 2]", None, allow_set_notation=True)
    assert isinstance(out, psu.SympyParseSuccess)
    interval = out.expr
    assert interval == sympy.Interval(1, 2)


def test_open_left_interval_literal_parses() -> None:
    x, y = sympy.symbols("x y")
    out = psu.try_parse_string_as_sympy(
        "(sin(x), y]", ["x", "y"], allow_set_notation=True
    )
    assert isinstance(out, psu.SympyParseSuccess)
    interval = out.expr
    assert interval == sympy.Interval.Lopen(sympy.sin(x), y)


def test_open_right_interval_literal_parses() -> None:
    x, y = sympy.symbols("x y")
    out = psu.try_parse_string_as_sympy(
        "[sin(x), y)", ["x", "y"], allow_set_notation=True
    )
    assert isinstance(out, psu.SympyParseSuccess)
    interval = out.expr
    assert interval == sympy.Interval.Ropen(sympy.sin(x), y)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (
            "(0, 1)",
            sympy.Interval.open(0, 1),
        ),
        (
            "(-oo, 5)",
            sympy.Interval.open(-sympy.oo, 5),
        ),
    ],
)
def test_open_interval_literal_parses(text: str, expected: sympy.Basic) -> None:
    out = psu.try_parse_string_as_sympy(text, None, allow_set_notation=True)
    assert isinstance(out, psu.SympyParseSuccess), out
    parsed = out.expr
    assert parsed == expected


def test_nested_interval_literal_is_rejected() -> None:
    out = psu.try_parse_string_as_sympy("[1, [2, 3]]", None, allow_set_notation=True)
    assert isinstance(out, psu.SympyParseFailure)
    err, interval = out.error, None
    assert err is not None
    assert interval is None


def test_disallowed_set_literal_is_rejected() -> None:
    out = psu.try_parse_string_as_sympy("{1,2,3}", None, allow_set_notation=False)
    assert isinstance(out, psu.SympyParseFailure)
    err, interval = out.error, None
    assert err is not None
    assert interval is None
    assert "set notation" in err


def test_disallowed_interval_literal_is_rejected() -> None:
    out = psu.try_parse_string_as_sympy("(0, 1]", None, allow_set_notation=False)
    assert isinstance(out, psu.SympyParseFailure)
    err, interval = out.error, None
    assert err is not None
    assert interval is None
    assert "set notation" in err


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("{1, 2, 3}", sympy.FiniteSet(1, 2, 3)),
        ("({1, 2, 3})", sympy.FiniteSet(1, 2, 3)),
    ],
)
def test_set_builder_notation_compiles_to_finite_sets(
    text: str, expected: sympy.Basic
) -> None:
    out = psu.try_parse_string_as_sympy(text, None, allow_set_notation=True)
    assert isinstance(out, psu.SympyParseSuccess)
    assert out.expr == expected


@pytest.mark.parametrize(
    "text",
    [
        "({1, 2, 3})",
        "([1, 2])",
        "(({1, 2, 3}) U ([1, 2]))",
    ],
)
def test_parentheses_around_sets_and_intervals_do_not_error(text: str) -> None:
    out = psu.try_parse_string_as_sympy(text, None, allow_set_notation=True)
    assert isinstance(out, psu.SympyParseSuccess)


def test_union_parser_uses_interval_transformation() -> None:
    out = psu.try_parse_string_as_sympy(
        "[1, 2] U (3, 4]", None, allow_set_notation=True
    )
    assert isinstance(out, psu.SympyParseSuccess)
    interval_union = out.expr
    assert interval_union == sympy.Union(
        sympy.Interval(1, 2), sympy.Interval.Lopen(3, 4)
    )


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (
            "(1, 2) U (3, 4]",
            sympy.Union(sympy.Interval.open(1, 2), sympy.Interval.Lopen(3, 4)),
        ),
        (
            "(1, 2) U {2, 4}",
            sympy.Union(sympy.Interval.Lopen(1, 2), sympy.FiniteSet(4)),
        ),
        (
            "[1, 2] U (3, 4]",
            sympy.Union(sympy.Interval(1, 2), sympy.Interval.Lopen(3, 4)),
        ),
        (
            "[1, 2] cup (3, 4]",
            sympy.Union(sympy.Interval(1, 2), sympy.Interval.Lopen(3, 4)),
        ),
        ("[1, 3] ∪ [2, 4]", sympy.Interval(1, 4)),  # noqa: RUF001
        (
            "[1, 2] U {3, 4, 5}",
            sympy.Union(sympy.Interval(1, 2), sympy.FiniteSet(3, 4, 5)),
        ),
    ],
)
def test_intervals_support_union(text: str, expected: sympy.Basic) -> None:
    out = psu.try_parse_string_as_sympy(text, None, allow_set_notation=True)
    assert isinstance(out, psu.SympyParseSuccess)
    parsed = out.expr
    assert parsed == expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (
            "({1, 3} U (2, 4])",
            sympy.Union(sympy.FiniteSet(1), sympy.Interval.Lopen(2, 4)),
        ),
        (
            "({1, 3} U (2, 4]) & {1, 2, 4}",
            sympy.Union(sympy.FiniteSet(1, 4)),
        ),
        (
            "(({1, 3} U (2, 4]) & {1, 2, 4})",
            sympy.Union(sympy.FiniteSet(1, 4)),
        ),
    ],
)
def test_set_expression_supports_grouped_compound_operations(
    text: str, expected: sympy.Basic
) -> None:
    out = psu.try_parse_string_as_sympy(text, None, allow_set_notation=True)
    assert isinstance(out, psu.SympyParseSuccess)
    assert out.expr == expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("[1, oo]", sympy.Interval(1, sympy.oo)),
        ("[-oo, 1]", sympy.Interval(-sympy.oo, 1)),
        ("[1, infty]", sympy.Interval(1, sympy.oo)),
        ("(1, oo]", sympy.Interval.Lopen(1, sympy.oo)),
        ("[1, oo)", sympy.Interval.Ropen(1, sympy.oo)),
        ("(1, oo)", sympy.Interval.open(1, sympy.oo)),
    ],
)
def test_interval_endpoints_accept_infinity(text: str, expected: sympy.Basic) -> None:
    out = psu.try_parse_string_as_sympy(text, None, allow_set_notation=True)
    assert isinstance(out, psu.SympyParseSuccess)
    assert out.expr == expected


@pytest.mark.parametrize(
    "submitted",
    ["[1, oo]", "[1, infty]"],
)
def test_infinite_interval_submissions_are_accepted(submitted: str) -> None:
    element_html = """
    <pl-symbolic-interval
        answers-name="test"
        allow-set-notation="true"
    ></pl-symbolic-interval>
    """
    data: dict[str, Any] = {
        "submitted_answers": {"test": submitted},
        "raw_submitted_answers": {"test": submitted},
        "correct_answers": {"test": "[1, oo]"},
        "answers_names": {},
        "format_errors": {},
        "partial_scores": {},
        "panel": "question",
        "editable": True,
    }

    symbolic_input.parse(element_html, data)
    assert "test" not in data["format_errors"]
    assert isinstance(data["submitted_answers"]["test"], dict)

    symbolic_input.grade(element_html, data)
    assert data["partial_scores"]["test"]["score"] == 1


@pytest.mark.parametrize(
    "text",
    [
        "[1, 2",
        "[1, 2, 3]",
        "[1, 2}",
        "{1, 2]",
    ],
)
def test_malformed_interval_notation_is_rejected(text: str) -> None:
    out = psu.try_parse_string_as_sympy(text, None, allow_set_notation=True)
    assert isinstance(out, psu.SympyParseFailure)
    assert "syntax error" in out.error


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (
            "(sin((x/2) + 1), cos(y - 1)]",
            sympy.Interval.Lopen(
                sympy.sin(sympy.Symbol("x") / 2 + 1), sympy.cos(sympy.Symbol("y") - 1)
            ),
        ),
        (
            "[1, exp(z + 1)]",
            sympy.Interval(1, sympy.exp(sympy.Symbol("z") + 1)),
        ),
    ],
)
def test_interval_endpoints_with_parenthesized_arguments_parse(
    text: str, expected: sympy.Basic
) -> None:
    out = psu.try_parse_string_as_sympy(text, ["x", "y", "z"], allow_set_notation=True)
    assert isinstance(out, psu.SympyParseSuccess)
    assert out.expr == expected
