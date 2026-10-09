import string

import pytest
from prairielearn.internal import symbolic_input


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
        ("|a|+||b|+c|", "abs(a)+abs(abs(b)+c)"),
        ("y*|x| + |(|z|+1)|", "y*abs(x) + abs((abs(z)+1))"),
        ("|x|||y||", "abs(x)abs(abs(y))"),
        ("", ""),
        # The formula editor writes \lvert and \rvert as U+2223
        ("2\u2223x\u2223", "2abs(x)"),
    ],
)
def test_format_submission_for_sympy_absolute_value(sub: str, expected: str) -> None:
    out, error_msg = symbolic_input.format_submission_for_sympy(sub)
    assert (out, error_msg) == (expected, None)


def test_format_submission_for_sympy_long_input() -> None:
    out, error_msg = symbolic_input.format_submission_for_sympy(
        "|x|" * 5000 + "|x+" * 2000 + "y" + "|" * 2000
    )
    assert error_msg is None
    assert out == "abs(x)" * 5000 + "abs(x+" * 2000 + "y" + ")" * 2000


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
        ("(0,|x|) | |y,z|", "(0,abs(x)) | |y,z|"),
        ("|1,|x||", "|1,abs(x)|"),
    ],
)
def test_format_submission_for_sympy_preserves_set_union(
    sub: str, expected: str
) -> None:
    out, error_msg = symbolic_input.format_submission_for_sympy(sub, allow_sets=True)
    assert (out, error_msg) == (expected, None)


@pytest.mark.parametrize(
    ("sub", "allow_trig", "variables", "custom_functions", "expected"),
    [
        # Greek letters
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
        ("s i n ( Α )", False, ["Α"], [], "s i n (  Alpha  )"),  # ruff:ignore[ambiguous-unicode-character-string]
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
        ("Α(x) + x2", False, ["x"], ["Α"], " Alpha (x) + x 2"),  # ruff:ignore[ambiguous-unicode-character-string]
        ("x2 + x2 + f2(x)", False, ["x"], ["f2"], "x 2 + x 2 + f2(x)"),
        # Formatting operators
        ("{:s i n ( x ):}", True, ["x"], [], "sin ( x )"),
        # Bare function arguments ended by "*" (the editor drops the grouping in `{\ln 4}\cdot`)
        ("l n 4 * c o t (9x)", True, ["x"], [], "ln (4) * cot (9x)"),
        ("s i n c o s x * x", True, ["x"], [], "sin (cos x) * x"),
        ("l n 4 / x", False, ["x"], [], "ln 4 / x"),
        # Bare function arguments ended by a "(" that multiplies them
        ("l n x (x+1)", False, ["x"], [], "ln (x) (x+1)"),
        ("l n 2x(x+1)", False, ["x"], [], "ln (2x)(x+1)"),
        ("l n 2(l n 3(x))", False, ["x"], [], "ln (2)(ln (3)(x))"),
        # A "(" that groups an exponent or calls a function stays in the argument
        ("l n x^(2)", False, ["x"], [], "ln x^(2)"),
        ("l n f(x)", False, ["x"], ["f"], "ln f(x)"),
        ("l n f2(x)", False, ["x"], ["f2"], "ln f2(x)"),
        ("l n a t a n 2(y,x)", True, ["x", "y"], [], "ln atan2(y,x)"),
        ("l n a b s (x)(x+1)", False, ["x"], [], "ln (abs (x))(x+1)"),
        ("l n Α(x)", False, ["x"], ["Α"], "ln  Alpha (x)"),  # ruff:ignore[ambiguous-unicode-character-string]
        # Operators the editor writes in AsciiMath form (\div and \ast)
        ("2 -: x", False, ["x"], [], "2 / x"),
        ("2 ** x", False, ["x"], [], "2 * x"),
        ("2 ** ** x", False, ["x"], [], "2 * ** x"),
        # \star is " *** ", which must not end a function argument
        ("l n 4 *** x", False, ["x"], [], "ln 4 *** x"),
        # Without LaTeX, typed "+-" is unchanged
        ("2+-a -: x", False, ["a"], [], "2+-a / x"),
    ],
)
def test_format_formula_editor_submission_for_sympy(
    sub: str,
    variables: list[str],
    custom_functions: list[str],
    expected: str,
    *,
    allow_trig: bool,
) -> None:
    out = symbolic_input.format_formula_editor_submission_for_sympy(
        sub,
        variables=variables,
        custom_functions=custom_functions,
        allow_trig=allow_trig,
    )
    assert out == expected


@pytest.mark.parametrize(
    ("sub", "expected"),
    [
        ("C o m p l e m e n t ({1},{2})", "Complement ({1},{2})"),
        ("{1} c u p {2} * {3}", "{1} cup {2} * {3}"),
    ],
)
def test_format_formula_editor_submission_with_set_names(
    sub: str, expected: str
) -> None:
    out = symbolic_input.format_formula_editor_submission_for_sympy(
        sub,
        allow_trig=False,
        variables=[],
        custom_functions=[],
        allow_sets=True,
    )
    assert out == expected


@pytest.mark.parametrize(
    ("submission", "latex", "expected"),
    [
        # Plain text and LaTeX captured from the formula editor
        ("2+-a+-b", r"2\pm a+-b", "2±a+-b"),
        ("(a+-b)+-sqrt(a+-b)", r"\left(a+-b\right)\pm\sqrt{a+-b}", "(a+-b)±sqrt(a+-b)"),
        ("a+-b+-c", r"a+{-b}\pm c", "a+-b±c"),
        ("2+-a", "2+-a", "2+-a"),
        # The plain text and LaTeX don't match up
        ("2+-a", r"2\pm a\pm b", None),
        ("2+-a+-b", "2+-a", None),
    ],
)
def test_restore_plus_minus(submission: str, latex: str, expected: str | None) -> None:
    assert symbolic_input._restore_plus_minus(submission, latex) == expected


def test_format_formula_editor_deeply_nested_bare_arguments() -> None:
    depth = 1200
    submission = "s i n f(" * depth + "x" + ")(y)" * depth
    expected = "sin (f(" * depth + "x" + "))(y)" * depth
    assert (
        symbolic_input.format_formula_editor_submission_for_sympy(
            submission, allow_trig=True, variables=["x", "y"], custom_functions=["f"]
        )
        == expected
    )
