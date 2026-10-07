import string

import prairielearn as pl
import prairielearn.sympy_utils as psu
import pytest
import sympy
from prairielearn.internal import symbolic_input


@pytest.mark.parametrize(
    ("submission", "expected"),
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
def test_format_submission_for_sympy_absolute_value(
    submission: str, expected: str
) -> None:
    result, error = symbolic_input._format_submission_for_sympy(submission)
    assert (result, error) == (expected, None)


@pytest.mark.parametrize(
    ("submission", "expected"),
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
    submission: str, expected: str
) -> None:
    result, error = symbolic_input._format_submission_for_sympy(
        submission, allow_sets=True
    )
    assert (result, error) == (expected, None)


@pytest.mark.parametrize(
    ("submission", "allow_trig", "variables", "custom_functions", "expected"),
    [
        ("Α", False, ["Α"], [], " Alpha "),  # ruff:ignore[ambiguous-unicode-character-string]
        ("ΑΑ0Α0ΑΑ", False, ["Α", "Α0"], [], " Alpha  Alpha0 Alpha0 Alpha  Alpha "),  # ruff:ignore[ambiguous-unicode-character-string]
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
        ("a b a b", False, ["ab", "aba"], [], "aba b"),
        ("a b c a b d", False, ["ab", "abc"], [], "abc ab d"),
        (
            "a b " * 1000,
            False,
            ["ab", *list(string.ascii_lowercase)[2:]],
            [],
            "ab " * 1000,
        ),
        ("s i n ( x )", True, ["x"], [], "sin ( x )"),
        ("s i n h ( s i n x )", True, ["x"], [], "sinh ( sin x )"),
        ("s i n ( x )", False, ["x"], [], "s i n ( x )"),
        ("s i n ( Α )", False, ["Α"], [], "s i n (  Alpha  )"),  # ruff:ignore[ambiguous-unicode-character-string]
        ("t i m e + x", True, ["time", "x"], [], "time + x"),
        ("a c o s h ( a c o s ( x ) )", True, ["x"], [], "acosh ( acos ( x ) )"),
        ("x2+x10", False, ["x"], [], "x 2+x 10"),
        ("e^x2", False, ["x"], [], "e^x 2"),
        ("m y f u n ( x )", False, ["x"], ["myfun"], "myfun ( x )"),
        ("f2(x) + x2", False, ["x"], ["f2"], "f2(x) + x 2"),
        ("Α(x) + x2", False, ["x"], ["Α"], " Alpha (x) + x 2"),  # ruff:ignore[ambiguous-unicode-character-string]
        ("x2 + x2 + f2(x)", False, ["x"], ["f2"], "x 2 + x 2 + f2(x)"),
        ("{:s i n ( x ):}", True, ["x"], [], "sin ( x )"),
    ],
)
def test_format_formula_editor_submission_for_sympy(
    submission: str,
    allow_trig: bool,  # ruff: ignore[boolean-type-hint-positional-argument]
    variables: list[str],
    custom_functions: list[str],
    expected: str,
) -> None:
    result = symbolic_input._format_formula_editor_submission_for_sympy(
        submission,
        variables,
        custom_functions,
        allow_trig_functions=allow_trig,
    )
    assert result == expected


@pytest.mark.parametrize(
    ("submission", "allowed_types"),
    [
        ("x + 1", {"expression"}),
        ("{1, 2}", {"finite-set"}),
        ("[1, 2]", {"interval"}),
        ("{1} | [2, 3]", {"all"}),
    ],
)
def test_parse_symbolic_submission_honors_allowed_types(
    submission: str, allowed_types: set[psu.AllowedSympyType]
) -> None:
    result = symbolic_input.try_parse_symbolic_submission(
        submission,
        ["x"],
        allowed_types=allowed_types,
    )
    assert isinstance(result, symbolic_input.SymbolicSubmissionParseSuccess)


@pytest.mark.parametrize(
    ("submission", "allowed_types", "error"),
    [
        ("{1, 2}", {"expression"}, "set notation is not allowed"),
        ("x + 1", {"finite-set"}, "uses expression"),
        ("{1, 2}", {"interval"}, "uses finite-set"),
        ("[1, 2]", {"finite-set"}, "uses interval"),
    ],
)
def test_parse_symbolic_submission_rejects_disallowed_types(
    submission: str,
    allowed_types: set[psu.AllowedSympyType],
    error: str,
) -> None:
    result = symbolic_input.try_parse_symbolic_submission(
        submission,
        ["x"],
        allowed_types=allowed_types,
    )
    assert isinstance(result, psu.SympyParseFailure)
    assert error in result.error


def _render_config() -> symbolic_input.RenderConfig:
    return symbolic_input.RenderConfig(
        name="symbolic",
        label=None,
        aria_label=None,
        suffix=None,
        variables=["x"],
        initial_value_variables=["x"],
        custom_functions=[],
        display=symbolic_input.DisplayType.INLINE,
        allow_complex=False,
        imaginary_unit="i",
        allow_trig=True,
        allowed_types={"expression"},
        simplify_expression=True,
        display_log_as_ln=False,
        size=20,
        placeholder="",
        show_score=False,
        show_info=False,
        formula_editor=False,
        initial_value=None,
    )


def test_render_with_config_uses_supplied_template_text(
    question_data: pl.QuestionData,
) -> None:
    question_data["editable"] = True
    template = (
        "{{#question}}{{name}}|{{#inline}}inline{{/inline}}|{{{info}}}{{/question}}"
        "{{#format}}variables={{#variables}}{{.}}{{/variables}}{{/format}}"
    )

    rendered = symbolic_input.render_with_config(
        _render_config(), question_data, template=template
    )

    assert rendered == "symbolic|inline|variables=x"


def test_render_with_config_prioritizes_format_error_over_missing_input(
    question_data: pl.QuestionData,
) -> None:
    question_data["panel"] = "submission"
    question_data["format_errors"]["symbolic"] = "invalid"
    template = (
        "{{#submission}}{{#parse_error}}error={{{parse_error}}}{{/parse_error}}"
        "{{#missing_input}}missing{{/missing_input}}{{/submission}}"
        "{{#format}}variables={{#variables}}{{.}}{{/variables}}{{/format}}"
        "{{#format_error}}; {{{format_string}}}{{/format_error}}"
    )

    rendered = symbolic_input.render_with_config(
        _render_config(), question_data, template=template
    )

    assert rendered == "error=invalid; variables=x"


def test_replace_imaginary_for_display() -> None:
    x = sympy.Symbol("x")

    assert symbolic_input.replace_imaginary_for_display(
        x + sympy.I, "j"
    ) == x + sympy.Symbol("j")
