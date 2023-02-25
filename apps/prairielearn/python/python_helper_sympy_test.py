import json

import pytest
import python_helper_sympy as phs
import sympy


class TestSympy:
    M, N = sympy.symbols("m n")

    EXPR_STRINGS = [
        "sin 5n",
        "5n",
        "n * m",
        "m + 1",
        "m**2 + n**2 + 4 * n",
        "n * sin(7*m) + m**2 * cos(6*n)",
        "i * n + m",
        "i * i * n",
        "sqrt(100)",
        "cos(m)",
        "sin(m)",
        "tan(m)",
        "arccos(m)",
        "arcsin(m)",
        "arctan(m)",
        "acos(m)",
        "asin(m)",
        "atan(m)",
        "arctan2(m, n)",
        "atan2(m, n)",
        "csc(m)",
        "sec(m)",
        "cot(m)",
        "ln(m)",
        "atanh(m)",
        "asinh(m)",
        "acosh(m)",
    ]

    EXPR_LIST: list = [
        sympy.sin(5*N),
        5 * N,
        M * N,
        M + 1,
        M * M + N * N + 4 * N,
        N * sympy.sin(M*7) + M * M * sympy.cos(N*6),
        sympy.I * N + M,
        -N,
        sympy.sympify(10),
        sympy.cos(M),
        sympy.sin(M),
        sympy.tan(M),
        sympy.acos(M),
        sympy.asin(M),
        sympy.atan(M),
        sympy.acos(M),
        sympy.asin(M),
        sympy.atan(M),
        sympy.atan2(M, N),
        sympy.atan2(M, N),
        sympy.csc(M),
        sympy.sec(M),
        sympy.cot(M),
        sympy.log(M),
        sympy.atanh(M),
        sympy.asinh(M),
        sympy.acosh(M),
    ]

    @pytest.mark.parametrize("a_sub, sympy_ref", zip(EXPR_STRINGS, EXPR_LIST))
    def test_string_conversion(self, a_sub: str, sympy_ref: sympy.Expr) -> None:
        assert sympy_ref == phs.convert_string_to_sympy(
            a_sub, ["n", "m"], allow_complex=True
        )

    @pytest.mark.parametrize("a_sub", EXPR_STRINGS)
    def test_valid_format(self, a_sub: str) -> None:
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

    @pytest.mark.parametrize("a_sub", EXPR_STRINGS)
    def test_json_conversion(self, a_sub: str) -> None:
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
    NO_FLOATS_CASES = ["3.5", "3.5*n", "3.14159*n**2"]
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
