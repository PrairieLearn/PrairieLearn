import json

import pytest
import python_helper_sympy as phs
import sympy


def test_evaluate() -> None:
    """Test evaluate in the case of custom functions"""

    z = sympy.Symbol("z")
    f = sympy.Function("f")
    custom_function = sympy.Function("custom_function")

    locals_for_eval: phs.LocalsForEval = {
        "functions": {str(f): f, str(custom_function): custom_function},
        "variables": {str(z): z},
        "helpers": {},
    }

    expression = f(z) + custom_function(z, 1) + 3  # type: ignore

    # Check that using custom functions on the backend works
    assert expression == phs.evaluate(
        "f(z) + custom_function(z, 1) + 3", locals_for_eval=locals_for_eval
    )

    # Safety check
    with pytest.raises(phs.BaseSympyError):
        phs.evaluate("eval('dict')", locals_for_eval=locals_for_eval)


class TestSympy:
    M, N = sympy.symbols("m n")

    EXPR_PAIRS = [
        ("3^m + 4", 3**M + 4),
        ("factorial(3m)", sympy.factorial(3 * M)),
        ("m! + n", sympy.factorial(M) + N),
        ("5mn sin m + arccos 3n", 5 * M * N * sympy.sin(M) + sympy.acos(3 * N)),
        ("sin**2 (m)", sympy.sin(M) ** 2),
        ("sin 5n", sympy.sin(5 * N)),
        ("5n", 5 * N),
        ("4n + 2m", 4 * N + 2 * M),
        ("n * m", M * N),
        ("m + 1", M + 1),
        ("m**2 + n**2 + 4 * n", M * M + N * N + 4 * N),
        (
            "n * sin(7*m) + m**2 * cos(6*n)",
            N * sympy.sin(M * 7) + M * M * sympy.cos(N * 6),
        ),
        ("3jn", sympy.I * 3 * N),
        ("i * n + m", sympy.I * N + M),
        ("i * i * n", -N),
        ("sqrt(100)", sympy.sympify(10)),
        ("cos(m)", sympy.cos(M)),
        ("sin(m)", sympy.sin(M)),
        ("tan(m)", sympy.tan(M)),
        ("arccos(m)", sympy.acos(M)),
        ("arcsin(m)", sympy.asin(M)),
        ("arctan(m)", sympy.atan(M)),
        ("acos(m)", sympy.acos(M)),
        ("asin(m)", sympy.asin(M)),
        ("atan(m)", sympy.atan(M)),
        ("arctan2(m, n)", sympy.atan2(M, N)),
        ("atan2(m, n)", sympy.atan2(M, N)),
        ("csc(m)", sympy.csc(M)),
        ("sec(m)", sympy.sec(M)),
        ("cot(m)", sympy.cot(M)),
        ("ln(m)", sympy.log(M)),
        ("atanh(m)", sympy.atanh(M)),
        ("asinh(m)", sympy.asinh(M)),
        ("acosh(m)", sympy.acosh(M)),
    ]

    @pytest.mark.parametrize("a_sub, sympy_ref", EXPR_PAIRS)
    def test_string_conversion(self, a_sub: str, sympy_ref: sympy.Expr) -> None:
        assert sympy_ref == phs.convert_string_to_sympy(
            a_sub, ["n", "m"], allow_complex=True
        )

    @pytest.mark.parametrize("a_pair", EXPR_PAIRS)
    def test_valid_format(self, a_pair: tuple[str, sympy.Expr]) -> None:
        a_sub, _ = a_pair
        assert (
            phs.validate_string_as_sympy(a_sub, ["n", "m"], allow_complex=True) is None
        )

    @pytest.mark.parametrize(
        "a_sub, sympy_ref", [("i", sympy.I), ("j", sympy.I), ("i*i", -1), ("j*j", -1)]
    )
    def test_string_conversion_no_complex(
        self, a_sub: str, sympy_ref: sympy.Expr
    ) -> None:
        assert sympy_ref != phs.convert_string_to_sympy(
            a_sub, ["i", "j"], allow_complex=False
        )

    @pytest.mark.parametrize("a_pair", EXPR_PAIRS)
    def test_json_conversion(self, a_pair: tuple[str, sympy.Expr]) -> None:
        a_sub, _ = a_pair
        sympy_expr = phs.convert_string_to_sympy(a_sub, ["n", "m"], allow_complex=True)
        # Check that json serialization works
        json_expr = json.dumps(phs.sympy_to_json(sympy_expr), allow_nan=False)

        # Check equivalence after converting back
        json_converted_expr = phs.json_to_sympy(json.loads(json_expr))
        assert sympy_expr == json_converted_expr

    # TODO parameterize this with more extensive test cases
    def test_assumption_conversion(self) -> None:
        assumptions = {"x": {"positive": True}, "y": {}}
        sympy_expr = phs.convert_string_to_sympy(
            "(x**2)**(1/2) + y + z",
            ["x", "y", "z"],
            allow_complex=True,
            assumptions=assumptions,
        )

        json_expr = json.dumps(phs.sympy_to_json(sympy_expr), allow_nan=False)

        # Check equivalence after converting back
        json_converted_expr = phs.json_to_sympy(json.loads(json_expr))
        assert sympy_expr == json_converted_expr
        assert sympy_expr.assumptions0 == json_converted_expr.assumptions0


class TestExceptions:
    VARIABLES = ["n"]

    COMPLEX_CASES = ["i", "5 * i", "j"]
    NO_FLOATS_CASES = ["3.5", "4.2n", "3.5*n", "3.14159*n**2"]
    INVALID_EXPRESSION_CASES = ["5==5", "5!=5", "5>5", "5<5", "5>=5", "5<=5"]
    INVALID_FUNCTION_CASES = ["eval(n)", "f(n)", "g(n)", "dir(n)"]
    INVALID_VARIABLE_CASES = ["x", "y", "z*n"]
    INVALID_PARSE_CASES = ["(", "n**", "n**2+"]
    INVALID_ESCAPE_CASES = ["\\", "n + 2 \\", "2 \\"]
    INVALID_COMMENT_CASES = ["#", "n + 2 # comment", "# x"]

    # Test exception cases

    @pytest.mark.parametrize("a_sub", COMPLEX_CASES)
    def test_not_allowed_complex(self, a_sub: str) -> None:
        with pytest.raises(phs.HasInvalidSymbolError):
            phs.convert_string_to_sympy(a_sub, self.VARIABLES, allow_complex=False)

    @pytest.mark.parametrize("a_sub", COMPLEX_CASES)
    def test_reserved_variables(self, a_sub: str) -> None:
        expr = phs.convert_string_to_sympy(a_sub, ["i", "j"], allow_complex=True)
        with pytest.raises(ValueError):
            phs.sympy_to_json(expr)

    @pytest.mark.parametrize("a_sub", NO_FLOATS_CASES)
    def test_no_floats(self, a_sub: str) -> None:
        with pytest.raises(phs.HasFloatError):
            phs.convert_string_to_sympy(a_sub, self.VARIABLES)

    @pytest.mark.parametrize("a_sub", INVALID_EXPRESSION_CASES)
    def test_invalid_expression(self, a_sub: str) -> None:
        with pytest.raises(phs.HasInvalidExpressionError):
            phs.convert_string_to_sympy(a_sub, self.VARIABLES)

    @pytest.mark.parametrize("a_sub", INVALID_FUNCTION_CASES)
    def test_invalid_function(self, a_sub: str) -> None:
        with pytest.raises((phs.HasInvalidSymbolError, phs.HasInvalidFunctionError)):
            phs.convert_string_to_sympy(a_sub, self.VARIABLES)

    @pytest.mark.parametrize("a_sub", INVALID_VARIABLE_CASES)
    def test_invalid_variable(self, a_sub: str) -> None:
        with pytest.raises(phs.HasInvalidSymbolError):
            phs.convert_string_to_sympy(a_sub, self.VARIABLES)

    @pytest.mark.parametrize("a_sub", INVALID_PARSE_CASES)
    def test_parse_error(self, a_sub: str) -> None:
        with pytest.raises(phs.HasParseError):
            phs.convert_string_to_sympy(a_sub, self.VARIABLES)

    @pytest.mark.parametrize("a_sub", INVALID_ESCAPE_CASES)
    def test_escape_error(self, a_sub: str) -> None:
        with pytest.raises(phs.HasEscapeError):
            phs.convert_string_to_sympy(a_sub, self.VARIABLES)

    @pytest.mark.parametrize("a_sub", INVALID_COMMENT_CASES)
    def test_comment_error(self, a_sub: str) -> None:
        with pytest.raises(phs.HasCommentError):
            phs.convert_string_to_sympy(a_sub, self.VARIABLES)

    # Test formatting strings from validation

    @pytest.mark.parametrize(
        "a_sub_list, target_string",
        [
            (NO_FLOATS_CASES, "floating-point number"),
            (INVALID_EXPRESSION_CASES, "invalid expression"),
            (INVALID_FUNCTION_CASES, "invalid"),
            (INVALID_VARIABLE_CASES, "invalid symbol"),
            (INVALID_PARSE_CASES, "syntax error"),
            (INVALID_ESCAPE_CASES, 'must not contain the character "\\"'),
            (INVALID_COMMENT_CASES, 'must not contain the character "#"'),
        ],
    )
    def test_invalid_format(self, a_sub_list: list[str], target_string: str) -> None:
        for a_sub in a_sub_list:
            format_error = phs.validate_string_as_sympy(
                a_sub, self.VARIABLES, allow_complex=False, allow_trig_functions=False
            )
            assert format_error is not None
            assert target_string in format_error
