import json
import re
from itertools import chain, repeat
from typing import Any

import prairielearn as pl
import prairielearn.sympy_utils as psu
import pytest
import sympy


def _caret(text: str, caret: str) -> str:
    """Join text and caret lines for readable caret-position test assertions."""
    return f"{text}\n{caret}"


def test_evaluate() -> None:
    """Test evaluate in the case of custom functions"""
    z = sympy.Symbol("z")
    f = sympy.Function("f")
    custom_function = sympy.Function("custom_function")

    locals_for_eval: psu.LocalsForEval = {
        "functions": {str(f): f, str(custom_function): custom_function},
        "variables": {str(z): z},
        "helpers": {},
    }

    expression = f(z) + custom_function(z, 1) + 3

    # Check that using custom functions on the backend works
    assert expression == psu.evaluate(
        "f(z) + custom_function(z, 1) + 3", locals_for_eval=locals_for_eval
    )

    # Safety check
    with pytest.raises(psu.BaseSympyError):
        psu.evaluate("eval('dict')", locals_for_eval=locals_for_eval)


class TestSympy:
    SYMBOL_NAMES = ("n", "m", "alpha", "\u03bc0")
    M, N, ALPHA, MU0 = sympy.symbols("m n alpha mu0")

    FUNCTION_NAMES = ("f", "g", "beef", "\u03c6")
    # Any annotations here to ignore annoying typechecking complaining
    F: Any = sympy.Function("f")
    G: Any = sympy.Function("g")
    BEEF: Any = sympy.Function("beef")
    PHI: Any = sympy.Function("phi")

    CUSTOM_FUNCTION_PAIRS = (
        ("f(1) + g(2)", F(1) + G(2)),
        ("f(g(n), 1)", F(G(N), 1)),
        ("f(1) + g(2, 3) + sin n", F(1) + G(2, 3) + sympy.sin(N)),
        ("beef(m + n)", BEEF(N + M)),
        ("beef(n) + f(m)", BEEF(N) + F(M)),
        ("\u03c6(\u03bc0)", PHI(MU0)),
    )

    INCORRECT_FUNCTION_PAIRS = (
        ("f(1) + g(2)", F(1) + G(2, 3)),
        ("f(1) + g(2)", G(1) + F(2)),
    )

    EXPR_PAIRS = (
        # Test unicode conversion
        ("1+\u03bc0", MU0 + 1),
        ("m \u2212 n", M - N),
        ("m - \uff08n + m\uff09", -N),
        ("m \uff0b n", N + M),
        # Normal test cases
        ("Max(m,n)", sympy.Max(N, M)),
        ("min(alpha, m, n)", sympy.Min(N, M, ALPHA)),
        ("max(m)", M),
        ("max(m,n)", sympy.Max(N, M)),
        ("abs(sign(alpha))", sympy.Abs(sympy.sign(ALPHA))),
        ("Abs(alpha)", sympy.Abs(ALPHA)),
        ("abs(n) * sgn(n)", sympy.Abs(N) * sympy.sign(N)),
        ("n alpha", ALPHA * N),
        ("n log^2 2n", N * (sympy.log(2 * N) ** 2)),
        ("e^(pi * i)", -1),
        ("infty", sympy.oo),
        ("infty", sympy.oo + 99),
        ("-infty", -sympy.oo),
        ("-infty + 99", -sympy.oo),
        ("n \u2212 m", N - M),
        ("n/-m", -N / M),
        ("n / 2", N / 2),
        ("3^m + 4", 3**M + 4),
        ("nm^(-1)", N / M),
        ("factorial(3m)", sympy.factorial(3 * M)),
        ("m! + n", sympy.factorial(M) + N),
        ("5mn sin m + arccos 3n", 5 * M * N * sympy.sin(M) + sympy.acos(3 * N)),
        ("sin**2 (m)", sympy.sin(M) ** 2),
        ("sin 5n", sympy.sin(5 * N)),
        ("pi", sympy.pi),
        ("+5n", 5 * N),
        ("-5n", -5 * N),
        ("4n + 2m", 4 * N + 2 * M),
        ("n * m", M * N),
        ("m - 1", M - 1),
        ("m**2 + n**2 - 4 * n", M * M + N * N - 4 * N),
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
        ("tanh(m)", sympy.tanh(M)),
        ("sinh(m)", sympy.sinh(M)),
        ("cosh(m)", sympy.cosh(M)),
    )

    # Using string-based comparisons here to bypass sympy's default simplification behavior
    # Note that even simplification disabled, we expect some basic normalizations like alphabetic sorting of expressions
    NO_SIMPLIFICATION_EXPR_PAIRS = (
        ("sin(atan(n))", "sin(atan(n))"),
        ("sin atan n", "sin(atan(n))"),
        ("ln(e**2)", "log(E**2)"),
        ("-infty + 99", "-oo + 99"),
        ("sin(arctan(n))", "sin(atan(n))"),
        ("2n-m+m-n", "-m + m - n + 2*n"),
    )

    @pytest.mark.parametrize(("a_sub", "ref"), NO_SIMPLIFICATION_EXPR_PAIRS)
    def test_no_simplification(self, a_sub: str, ref: str) -> None:
        assert ref == str(
            psu.convert_string_to_sympy(
                a_sub,
                self.SYMBOL_NAMES,
                simplify_expression=False,
            )
        )

    @pytest.mark.parametrize(("a_sub", "sympy_ref"), CUSTOM_FUNCTION_PAIRS)
    def test_custom_function_conversion(
        self, a_sub: str, sympy_ref: sympy.Expr
    ) -> None:
        assert sympy_ref == psu.convert_string_to_sympy(
            a_sub,
            self.SYMBOL_NAMES,
            allow_complex=True,
            custom_functions=self.FUNCTION_NAMES,
        )

    @pytest.mark.parametrize(("a_sub", "sympy_ref"), INCORRECT_FUNCTION_PAIRS)
    def test_custom_function_incorrect(self, a_sub: str, sympy_ref: sympy.Expr) -> None:
        assert sympy_ref != psu.convert_string_to_sympy(
            a_sub,
            self.SYMBOL_NAMES,
            allow_complex=True,
            custom_functions=self.FUNCTION_NAMES,
        )

    @pytest.mark.parametrize(("a_sub", "sympy_ref"), EXPR_PAIRS)
    def test_string_conversion(self, a_sub: str, sympy_ref: sympy.Expr) -> None:
        assert sympy_ref == psu.convert_string_to_sympy(
            a_sub,
            self.SYMBOL_NAMES,
            allow_complex=True,
        )

    @pytest.mark.parametrize("a_pair", EXPR_PAIRS)
    def test_valid_format(self, a_pair: tuple[str, sympy.Expr]) -> None:
        a_sub, _ = a_pair
        assert (
            psu.validate_string_as_sympy(a_sub, self.SYMBOL_NAMES, allow_complex=True)
            is None
        )

    @pytest.mark.parametrize(
        ("a_sub", "sympy_ref"),
        [("i", sympy.I), ("j", sympy.I), ("i*i", -1), ("j*j", -1)],
    )
    def test_string_conversion_no_complex(
        self, a_sub: str, sympy_ref: sympy.Expr
    ) -> None:
        assert sympy_ref != psu.convert_string_to_sympy(
            a_sub, ["i", "j"], allow_complex=False
        )

    @pytest.mark.parametrize(
        ("a_sub", "variables", "allow_complex", "expected", "expected_error"),
        [
            # See https://github.com/PrairieLearn/PrairieLearn/issues/13661 for additional details.
            ("3j", ["j"], False, 3 * sympy.Symbol("j"), None),
            ("3J", ["J"], False, 3 * sympy.Symbol("J"), None),  # Uppercase
            (
                "3j",
                ["n"],
                True,
                3 * sympy.I,
                None,
            ),  # Ensure complex numbers still work when allowed
            ("3j", ["x"], False, None, psu.HasInvalidSymbolError),  # j not declared
            ("3e5j", ["j"], False, None, psu.HasFloatError),  # Scientific notation
        ],
    )
    def test_j_complex_literal_handling(
        self,
        a_sub: str,
        variables: list[str],
        allow_complex: bool,  # noqa: FBT001
        expected: sympy.Expr | None,
        expected_error: type[psu.BaseSympyError] | None,
    ) -> None:
        if expected_error is not None:
            with pytest.raises(expected_error):
                psu.convert_string_to_sympy(
                    a_sub, variables, allow_complex=allow_complex
                )
        else:
            result = psu.convert_string_to_sympy(
                a_sub, variables, allow_complex=allow_complex
            )
            assert result == expected

    @pytest.mark.parametrize(
        ("a_sub", "variables", "expected"),
        [
            # See https://github.com/PrairieLearn/PrairieLearn/issues/11709 for additional details.
            ("2e+3", None, 2 * sympy.E + 3),
            ("2e-3", None, 2 * sympy.E - 3),
            ("2E+3", ["E"], 2 * sympy.Symbol("E") + 3),
            ("2E-3", ["E"], 2 * sympy.Symbol("E") - 3),
        ],
    )
    def test_scientific_notation_with_sign_as_euler(
        self, a_sub: str, variables: list[str] | None, expected: sympy.Expr
    ) -> None:
        result = psu.convert_string_to_sympy(a_sub, variables, allow_complex=True)
        assert result == expected

    def test_string_conversion_complex_conflict(self) -> None:
        """
        Check for no issues in the case where complex is not
        allowed and variable is named "I".
        """
        a_sub = "2I"
        var = sympy.symbols("I")
        ref_expr = 2 * var

        assert ref_expr == psu.convert_string_to_sympy(
            a_sub, ["I"], allow_complex=False
        )

        assert ref_expr == psu.json_to_sympy(psu.sympy_to_json(ref_expr))

    @pytest.mark.parametrize(
        ("a_pair", "custom_functions"),
        chain(
            zip(EXPR_PAIRS, repeat(None)),
            zip(CUSTOM_FUNCTION_PAIRS, repeat(FUNCTION_NAMES)),
        ),
    )
    @pytest.mark.parametrize("remove_assumptions", [True, False])
    def test_json_conversion(
        self,
        a_pair: tuple[str, sympy.Expr],
        custom_functions: list[str] | None,
        remove_assumptions: bool,  # noqa: FBT001
    ) -> None:
        a_sub, _ = a_pair
        sympy_expr = psu.convert_string_to_sympy(
            a_sub,
            self.SYMBOL_NAMES,
            allow_complex=True,
            custom_functions=custom_functions,
        )
        # Check that json serialization works
        json_dict = psu.sympy_to_json(sympy_expr)

        if remove_assumptions:
            json_dict.pop("_assumptions")

        json_expr = json.dumps(json_dict, allow_nan=False)

        # Check equivalence after converting back
        json_converted_expr = psu.json_to_sympy(json.loads(json_expr))

        assert sympy_expr == json_converted_expr

    @pytest.mark.parametrize(
        ("assumptions", "expression_str"),
        [
            ({"x": {"positive": True}, "y": {"real": True}}, "(x**2)**(1/2) + y"),
            ({"x": {"positive": False}, "z": {"complex": True}}, "z^2 + y - x"),
            (
                {
                    "x": {"positive": False},
                    "y": {"positive": True},
                    "z": {"positive": True},
                },
                "z^2 + y^2 - x**3",
            ),
            ({}, "z^2 + y - x"),
        ],
    )
    def test_assumption_conversion(
        self, assumptions: dict[str, dict[str, Any]], expression_str: str
    ) -> None:
        sympy_expr = psu.convert_string_to_sympy(
            expression_str,
            ["x", "y", "z"],
            allow_complex=True,
            assumptions=assumptions,
        )

        json_expr = json.dumps(psu.sympy_to_json(sympy_expr), allow_nan=False)

        # Check equivalence after converting back
        json_converted_expr = psu.json_to_sympy(json.loads(json_expr))
        assert sympy_expr == json_converted_expr
        assert sympy_expr.assumptions0 == json_converted_expr.assumptions0

        # Ensure this works with to_json/from_json as well
        assert sympy_expr == pl.from_json(pl.to_json(sympy_expr))

    @pytest.mark.parametrize(
        ("matrix"),
        [
            sympy.Matrix([[1, -1], [3, 4], [0, 2]]),  # rectangular matrix
            sympy.Matrix([[sympy.Symbol("x")]]),  # matrix with symbols
            sympy.Matrix([[]]),  # empty matrix
        ],
    )
    def test_matrix_conversion(self, matrix: sympy.Matrix) -> None:
        # Check equivalence after converting back
        assert matrix == pl.from_json(pl.to_json(matrix))

    @pytest.mark.parametrize(
        ("expr", "bad_assumptions"),
        [
            ("f(1)", {"f": {}}),
            ("x+5", {"x": {}}),
        ],
    )
    def test_bad_assumption_conversion(
        self, expr: str, bad_assumptions: psu.AssumptionsDictT
    ) -> None:
        with pytest.raises(psu.HasInvalidAssumptionError):
            psu.convert_string_to_sympy(
                expr,
                custom_functions=["f"],
                variables=["y"],
                assumptions=bad_assumptions,
            )


class TestExceptions:
    VARIABLES: tuple[str] = ("n",)

    COMPLEX_CASES = ("i", "5 * i", "j", "I")
    NO_FLOATS_CASES = ("3.5", "4.2n", "3.5*n", "3.14159*n**2", "sin(2.3)")
    INVALID_EXPRESSION_CASES = ("5==5", "5!=5", "5>5", "5<5", "5>=5", "5<=5")
    INVALID_FUNCTION_CASES = ("eval(n)", "f(n)", "g(n)+cos(n)", "dir(n)", "sin(f(n))")
    INVALID_VARIABLE_CASES = ("x", "exp(y)", "z*n")
    FUNCTION_NOT_CALLED_CASES = ("2+exp", "cos*n")
    INVALID_PARSE_CASES = ("(", "n**", "n**2+", "!")
    INVALID_ESCAPE_CASES = ("\\", "n + 2 \\", "2 \\", "1\uff3c2")
    INVALID_COMMENT_CASES = ("#", "n + 2 # comment", "# x", "1\uff032")

    # Test exception cases

    @pytest.mark.parametrize("a_sub", COMPLEX_CASES)
    def test_not_allowed_complex(self, a_sub: str) -> None:
        with pytest.raises((psu.HasComplexError, psu.HasInvalidSymbolError)):
            psu.convert_string_to_sympy(a_sub, self.VARIABLES, allow_complex=False)

    @pytest.mark.parametrize("a_sub", COMPLEX_CASES)
    def test_reserved_variables(self, a_sub: str) -> None:
        with pytest.raises(psu.HasConflictingVariableError):
            psu.convert_string_to_sympy(a_sub, ["i", "j"], allow_complex=True)

    def test_reserved_functions(self) -> None:
        with pytest.raises(psu.HasConflictingFunctionError):
            psu.convert_string_to_sympy("sin 1", custom_functions=["sin", "f"])

    @pytest.mark.parametrize("a_sub", NO_FLOATS_CASES)
    def test_no_floats(self, a_sub: str) -> None:
        with pytest.raises(psu.HasFloatError):
            psu.convert_string_to_sympy(a_sub, self.VARIABLES)

    @pytest.mark.parametrize("a_sub", INVALID_EXPRESSION_CASES)
    def test_invalid_expression(self, a_sub: str) -> None:
        with pytest.raises(psu.HasInvalidExpressionError):
            psu.convert_string_to_sympy(a_sub, self.VARIABLES)

    @pytest.mark.parametrize("a_sub", INVALID_FUNCTION_CASES)
    def test_invalid_function(self, a_sub: str) -> None:
        with pytest.raises((psu.HasInvalidSymbolError, psu.HasInvalidFunctionError)):
            psu.convert_string_to_sympy(a_sub, self.VARIABLES)

    @pytest.mark.parametrize("a_sub", INVALID_VARIABLE_CASES)
    def test_invalid_variable(self, a_sub: str) -> None:
        with pytest.raises((psu.HasInvalidSymbolError, psu.HasInvalidVariableError)):
            psu.convert_string_to_sympy(a_sub, self.VARIABLES)

    @pytest.mark.parametrize("a_sub", FUNCTION_NOT_CALLED_CASES)
    def test_function_not_called(self, a_sub: str) -> None:
        with pytest.raises(psu.FunctionNameWithoutArgumentsError):
            psu.convert_string_to_sympy(a_sub, self.VARIABLES)

    @pytest.mark.parametrize("a_sub", INVALID_PARSE_CASES)
    def test_parse_error(self, a_sub: str) -> None:
        with pytest.raises(psu.HasParseError):
            psu.convert_string_to_sympy(a_sub, self.VARIABLES)

    @pytest.mark.parametrize("a_sub", INVALID_ESCAPE_CASES)
    def test_escape_error(self, a_sub: str) -> None:
        with pytest.raises(psu.HasEscapeError):
            psu.convert_string_to_sympy(a_sub, self.VARIABLES)

    @pytest.mark.parametrize("a_sub", INVALID_COMMENT_CASES)
    def test_comment_error(self, a_sub: str) -> None:
        with pytest.raises(psu.HasCommentError):
            psu.convert_string_to_sympy(a_sub, self.VARIABLES)

    # Test formatting strings from validation

    @pytest.mark.parametrize(
        ("a_sub_list", "target_string", "with_vars"),
        [
            (NO_FLOATS_CASES, "floating-point number", ()),
            (INVALID_EXPRESSION_CASES, "invalid expression", ()),
            (INVALID_FUNCTION_CASES, "invalid", ()),
            (INVALID_VARIABLE_CASES, "invalid symbol", ()),
            (INVALID_PARSE_CASES, "syntax error", ()),
            (INVALID_ESCAPE_CASES, 'must not contain the character "\\"', ()),
            (INVALID_COMMENT_CASES, 'must not contain the character "#"', ()),
            # TODO: not handled
            # (COMPLEX_CASES, "must be expressed as integers", ("i",)),
        ],
    )
    def test_invalid_format(
        self, a_sub_list: list[str], target_string: str, with_vars: tuple[str]
    ) -> None:
        for a_sub in a_sub_list:
            format_error = psu.validate_string_as_sympy(
                a_sub,
                self.VARIABLES + with_vars,
                allow_complex=False,
                allow_trig_functions=True,
            )
            assert format_error is not None
            assert target_string in format_error

    @pytest.mark.parametrize(
        ("expr", "expected_caret", "with_vars"),
        [
            # #14141: '#' after large integer — stringify_expr wraps it as Integer(1234567890),
            # shifting the '#' offset. Caret must still point at '#' in the original input.
            (
                "1234567890 # abcdefghij",
                _caret(
                    "7890 # abc",
                    "     ^     ",
                ),
                (),
            ),
            # '#' at the very start of the expression
            (
                "# x + 1",
                _caret(
                    "# x +",
                    "^     ",
                ),
                (),
            ),
            # '#' after '^' which becomes '**' (offset shift from replacement)
            (
                "n^2 # comment",
                _caret(
                    "n^2 # com",
                    "    ^     ",
                ),
                (),
            ),
            # #14141: '\\' at the start — previously misreported as generic "syntax error"
            # because stringify_expr raised TokenError before ast_check_str ran
            (
                "\\n + 2",
                _caret(
                    "\\n + ",
                    "^     ",
                ),
                (),
            ),
            # '\\' after a large integer
            (
                "1234567890 \\",
                _caret(
                    "7890 \\",
                    "     ^ ",
                ),
                (),
            ),
            # #14142: invalid symbol — previously showed an empty caret pointing at nothing
            # because point_to_error received ind=-1
            (
                "nlogn",
                _caret(
                    "nlogn",
                    "  ^   ",
                ),
                (),
            ),
            # Invalid symbol in the middle of a valid expression
            (
                "n + abc",
                _caret(
                    " + abc",
                    "     ^ ",
                ),
                (),
            ),
            # Invalid symbol at the start
            (
                "xyz * n",
                _caret(
                    "xyz * n",
                    "  ^     ",
                ),
                (),
            ),
            # Invalid symbol after a valid symbol containing the same character
            (
                "ab + a",
                _caret(
                    "ab + a",
                    "     ^ ",
                ),
                ("ab",),
            ),
        ],
    )
    def test_error_caret_output(
        self, expr: str, expected_caret: str, with_vars: tuple[str, ...]
    ) -> None:
        """Regression tests for #14141 and #14142.

        Verifies that the caret visualization in error messages points at the
        correct character in the original input expression.
        """
        error_msg = psu.validate_string_as_sympy(expr, self.VARIABLES + with_vars)
        assert error_msg is not None
        match = re.search(r"<pre>(.*?)</pre>", error_msg, re.DOTALL)
        assert match is not None
        assert match.group(1) == expected_caret

    def test_invalid_function_with_simplify_false(self) -> None:
        """Test that invalid function calls are caught with simplify_expression=False.

        This is a regression test for https://github.com/PrairieLearn/PrairieLearn/issues/13084
        where using display-simplified-expression="false" would cause an unhandled exception
        when students submitted expressions like "m(0)" where "m" is not a valid function.
        """
        error_msg = psu.validate_string_as_sympy(
            "m(0)",
            ["x"],
            simplify_expression=False,
        )
        assert error_msg is not None
        assert 'invalid symbol "m"' in error_msg


@pytest.mark.parametrize(
    ("input_str", "expected_output"),
    [("abba", "abba"), ("\u03bc0", "mu0"), ("\u03bb", "lambda")],
)
def test_greek_unicode_transform(input_str: str, expected_output: str) -> None:
    assert psu.greek_unicode_transform(input_str) == expected_output


@pytest.mark.parametrize(
    ("items_string", "expected_output"),
    [
        ("1, 2, a", ["1", "2", "a"]),
        (None, []),
    ],
)
def test_get_items_list(items_string: str | None, expected_output: list[str]) -> None:
    assert psu.get_items_list(items_string) == expected_output


class TestValidateNamesForConflicts:
    """Tests for validate_names_for_conflicts()."""

    def test_no_conflicts(self) -> None:
        # Should not raise when there are no conflicts
        psu.validate_names_for_conflicts("test", ["x", "y"], ["f", "g"])

    @pytest.mark.parametrize("conflicting_name", ["e", "pi", "infty"])
    def test_variable_conflicts_with_constant(self, conflicting_name: str) -> None:
        with pytest.raises(ValueError, match=conflicting_name):
            psu.validate_names_for_conflicts("test", [conflicting_name, "x"], [])

    def test_variable_conflicts_with_function(self) -> None:
        with pytest.raises(ValueError, match="sin"):
            psu.validate_names_for_conflicts("test", ["sin"], [])

    def test_custom_function_conflicts_with_builtin(self) -> None:
        with pytest.raises(ValueError, match="cos"):
            psu.validate_names_for_conflicts("test", [], ["cos"])

    @pytest.mark.parametrize("conflicting_name", ["i", "j"])
    def test_complex_constants_only_conflict_when_enabled(
        self, conflicting_name: str
    ) -> None:
        psu.validate_names_for_conflicts(
            "test", [conflicting_name], [], allow_complex=False
        )
        psu.validate_names_for_conflicts(
            "test", [], [conflicting_name], allow_complex=False
        )

        with pytest.raises(ValueError, match=conflicting_name):
            psu.validate_names_for_conflicts(
                "test", [conflicting_name], [], allow_complex=True
            )
        with pytest.raises(ValueError, match=conflicting_name):
            psu.validate_names_for_conflicts(
                "test", [], [conflicting_name], allow_complex=True
            )

    @pytest.mark.parametrize("conflicting_name", ["sin", "cos", "tan"])
    def test_trig_functions_only_conflict_when_enabled(
        self, conflicting_name: str
    ) -> None:
        psu.validate_names_for_conflicts(
            "test", [conflicting_name], [], allow_trig_functions=False
        )
        psu.validate_names_for_conflicts(
            "test", [], [conflicting_name], allow_trig_functions=False
        )

        with pytest.raises(ValueError, match=conflicting_name):
            psu.validate_names_for_conflicts("test", [conflicting_name], [])
        with pytest.raises(ValueError, match=conflicting_name):
            psu.validate_names_for_conflicts("test", [], [conflicting_name])


class TestValidateStringConfigurationErrors:
    """Tests for configuration error messages in validate_string_as_sympy()."""

    def test_conflicting_variable_error_message(self) -> None:
        error_msg = psu.validate_string_as_sympy("x + 1", ["pi", "x"])
        assert error_msg is not None
        assert "conflicts with a built-in constant" in error_msg

    def test_conflicting_function_error_message(self) -> None:
        error_msg = psu.validate_string_as_sympy(
            "x + 1", ["x"], custom_functions=["sin"]
        )
        assert error_msg is not None
        assert "conflicts with a built-in function" in error_msg
