import importlib

import pytest

symbolic_input = importlib.import_module("pl-symbolic-input")


@pytest.mark.parametrize(
    ("sub", "allow_trig", "variables", "custom_functions", "expected"),
    [
        # Greek letters
        ("Α", False, ["Α"], [], " Alpha "),  # noqa: RUF001
        ("ΑΑ0Α0ΑΑ", False, ["Α", "Α0"], [], " Alpha  Alpha0 Alpha0 Alpha  Alpha "),  # noqa: RUF001
        # Trig functions
        ("s i n ( x )", True, ["x"], [], "sin ( x )"),
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
