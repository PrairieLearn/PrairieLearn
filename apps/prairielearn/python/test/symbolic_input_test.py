import html
import string

import prairielearn.sympy_utils as psu
import pytest


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
        ("|a|+||b|+c|", "abs(a)+abs(abs(b)+c)"),
        ("y*|x| + |(|z|+1)|", "y*abs(x) + abs((abs(z)+1))"),
        ("|x|||y||", "abs(x)abs(abs(y))"),
        ("", ""),
        ("2\u2223x\u2223", "2abs(x)"),
    ],
)
def test_normalize_absolute_value_bars(submission: str, expected: str) -> None:
    assert psu._normalize_absolute_value_bars(submission, allow_sets=False) == expected


def test_normalize_absolute_value_bars_handles_long_input() -> None:
    result = psu._normalize_absolute_value_bars(
        "|x|" * 5000 + "|x+" * 2000 + "y" + "|" * 2000,
        allow_sets=False,
    )

    assert result == "abs(x)" * 5000 + "abs(x+" * 2000 + "y" + ")" * 2000


@pytest.mark.parametrize("submission", ["|x", "x|", "|<img src=x onerror=alert(1)>"])
def test_try_parse_string_as_sympy_reports_ambiguous_absolute_value_bars(
    submission: str,
) -> None:
    result = psu.try_parse_string_as_sympy(submission, ["x"])

    assert result == psu.SympyParseFailure(
        "The absolute value bars in your answer are mismatched or ambiguous: "
        f"<code>{html.escape(submission)}</code>."
    )


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
        ("(0,|x|) | |y,z|", "(0,abs(x)) | |y,z|"),
        ("|1,|x||", "|1,abs(x)|"),
    ],
)
def test_normalize_absolute_value_bars_preserves_set_union(
    submission: str, expected: str
) -> None:
    assert psu._normalize_absolute_value_bars(submission, allow_sets=True) == expected


@pytest.mark.parametrize(
    (
        "submission",
        "allow_trig_functions",
        "variables",
        "custom_functions",
        "expected",
    ),
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
        ("l n 4 * c o t (9x)", True, ["x"], [], "ln (4) * cot (9x)"),
        ("s i n c o s x * x", True, ["x"], [], "sin (cos x) * x"),
        ("l n 4 / x", False, ["x"], [], "ln 4 / x"),
        ("l n x (x+1)", False, ["x"], [], "ln (x) (x+1)"),
        ("l n 2x(x+1)", False, ["x"], [], "ln (2x)(x+1)"),
        ("l n 2(l n 3(x))", False, ["x"], [], "ln (2)(ln (3)(x))"),
        ("l n x^(2)", False, ["x"], [], "ln x^(2)"),
        ("l n f(x)", False, ["x"], ["f"], "ln f(x)"),
        ("l n f2(x)", False, ["x"], ["f2"], "ln f2(x)"),
        ("l n a t a n 2(y,x)", True, ["x", "y"], [], "ln atan2(y,x)"),
        ("l n a b s (x)(x+1)", False, ["x"], [], "ln (abs (x))(x+1)"),
        ("l n Α(x)", False, ["x"], ["Α"], "ln  Alpha (x)"),  # ruff:ignore[ambiguous-unicode-character-string]
        ("2 -: x", False, ["x"], [], "2 / x"),
        ("2 ** x", False, ["x"], [], "2 * x"),
        ("2 ** ** x", False, ["x"], [], "2 * ** x"),
        ("l n 4 *** x", False, ["x"], [], "ln 4 *** x"),
        ("2+-a -: x", False, ["a"], [], "2+-a / x"),
    ],
)
def test_normalize_formula_editor_output(
    submission: str,
    *,
    allow_trig_functions: bool,
    variables: list[str],
    custom_functions: list[str],
    expected: str,
) -> None:
    assert (
        psu.normalize_formula_editor_output(
            submission,
            variables,
            allow_trig_functions=allow_trig_functions,
            custom_functions=custom_functions,
        )
        == expected
    )


@pytest.mark.parametrize(
    ("submission", "expected"),
    [
        ("C o m p l e m e n t ({1},{2})", "Complement ({1},{2})"),
        ("{1} c u p {2} * {3}", "{1} cup {2} * {3}"),
    ],
)
def test_normalize_formula_editor_output_with_set_names(
    submission: str, expected: str
) -> None:
    assert (
        psu.normalize_formula_editor_output(
            submission,
            [],
            allow_trig_functions=False,
            allow_sets=True,
        )
        == expected
    )


@pytest.mark.parametrize(
    ("submission", "latex", "expected"),
    [
        ("2+-a+-b", r"2\pm a+-b", "2±a+-b"),
        (
            "(a+-b)+-sqrt(a+-b)",
            r"\left(a+-b\right)\pm\sqrt{a+-b}",
            "(a+-b)±sqrt(a+-b)",
        ),
        ("a+-b+-c", r"a+{-b}\pm c", "a+-b±c"),
        ("2+-a", "2+-a", "2+-a"),
        ("2+-a", r"2\pm a\pm b", None),
        ("2+-a+-b", "2+-a", None),
    ],
)
def test_normalize_formula_editor_output_restores_plus_minus(
    submission: str, latex: str, expected: str | None
) -> None:
    assert psu.normalize_formula_editor_output(submission, [], latex=latex) == expected


def test_normalize_formula_editor_output_handles_deep_input() -> None:
    depth = 1200
    submission = "s i n f(" * depth + "x" + ")(y)" * depth
    expected = "sin (f(" * depth + "x" + "))(y)" * depth

    assert (
        psu.normalize_formula_editor_output(
            submission,
            ["x", "y"],
            custom_functions=["f"],
        )
        == expected
    )
