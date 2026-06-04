import json
from typing import cast

import pytest
import sympy
from mathjson import MathJsonExpression
from mathjson_utils import (
    MathJsonParseError,
    MathJsonStudentError,
    mathjson_to_sympy_expr,
    raw_mathjson_to_sympy_expr,
    sympy_expr_to_raw_mathjson,
)
from sympy.core.symbol import Str


def _raw_mathjson(mathjson: MathJsonExpression) -> str:
    return json.dumps(mathjson)


def test_converts_raw_mathjson_string() -> None:
    x = sympy.Symbol("x")

    expr = raw_mathjson_to_sympy_expr(_raw_mathjson(["Add", "x", 1]))

    assert expr == x + 1


def test_converts_arithmetic_expression() -> None:
    x = sympy.Symbol("x")

    expr = mathjson_to_sympy_expr(["Add", ["Multiply", 2, "x"], {"num": "3"}])

    assert expr == 2 * x + 3


@pytest.mark.parametrize(
    ("mathjson", "expected"),
    [
        (0, sympy.Integer(0)),
        (-7, sympy.Integer(-7)),
        (1.25, sympy.Float(1.25)),
        (float("nan"), sympy.nan),
        (float("inf"), sympy.oo),
        (-float("inf"), -sympy.oo),
    ],
)
def test_converts_json_number_primitives(
    mathjson: MathJsonExpression,
    expected: sympy.Basic,
) -> None:
    assert mathjson_to_sympy_expr(mathjson) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("0", sympy.Integer(0)),
        ("42", sympy.Integer(42)),
        ("+42", sympy.Integer(42)),
        ("-42", sympy.Integer(-42)),
        ("3.14", sympy.Float("3.14")),
        ("-0.125", sympy.Float("-0.125")),
        ("6.02e23", sympy.Float("6.02e23")),
        ("1E3", sympy.Float("1E3")),
        ("-1.25e-2", sympy.Float("-1.25e-2")),
        ("0.(3)", sympy.Rational(1, 3)),
        ("+0.(6)", sympy.Rational(2, 3)),
        ("0.0(9)", sympy.Rational(1, 10)),
        ("0.(09)", sympy.Rational(1, 11)),
        ("1.2(34)", sympy.Rational(611, 495)),
        ("-1.(6)", sympy.Rational(-5, 3)),
        ("2.(142857)", sympy.Rational(15, 7)),
        ("12(3)", sympy.Rational(37, 3)),
        ("1.2(3)e+2", sympy.Rational(370, 3)),
        ("1.(3)e-1", sympy.Rational(2, 15)),
    ],
)
def test_converts_mathjson_number_strings(
    value: str,
    expected: sympy.Basic,
) -> None:
    assert mathjson_to_sympy_expr({"num": value}) == expected
    assert mathjson_to_sympy_expr(value) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("NaN", sympy.nan),
        ("nan", sympy.nan),
        ("NAN", sympy.nan),
        ("Infinity", sympy.oo),
        ("+Infinity", sympy.oo),
        ("infinity", sympy.oo),
        ("+infinity", sympy.oo),
        ("INFINITY", sympy.oo),
        ("+INFINITY", sympy.oo),
        ("oo", sympy.oo),
        ("+oo", sympy.oo),
        ("OO", sympy.oo),
        ("+OO", sympy.oo),
        ("-Infinity", -sympy.oo),
        ("-infinity", -sympy.oo),
        ("-INFINITY", -sympy.oo),
        ("-oo", -sympy.oo),
        ("-OO", -sympy.oo),
    ],
)
def test_converts_mathjson_special_number_strings(
    value: str,
    expected: sympy.Basic,
) -> None:
    assert mathjson_to_sympy_expr({"num": value}) == expected
    assert mathjson_to_sympy_expr(value) == expected


def test_normalizes_whitespace_in_number_objects_only() -> None:
    assert mathjson_to_sympy_expr({"num": " \t12\u00a0.5\n"}) == sympy.Float("12.5")
    assert mathjson_to_sympy_expr({"num": "\r+Infinity\n"}) == sympy.oo
    assert mathjson_to_sympy_expr(" 12.5 ") == Str(" 12.5 ")


def test_does_not_accept_infty_as_a_compute_engine_number_spelling() -> None:
    assert mathjson_to_sympy_expr("Infty") == sympy.Symbol("Infty")

    with pytest.raises(ValueError, match='String "Infty" does not denote a Number'):
        mathjson_to_sympy_expr({"num": "Infty"})


def test_converts_function_object() -> None:
    x = sympy.Symbol("x")

    expr = mathjson_to_sympy_expr({"fn": ["Power", "x", 2]})

    assert expr == x**2


def test_round_trips_sympy_expression_to_raw_mathjson() -> None:
    x = sympy.Symbol("x")
    expr = cast(sympy.Basic, sympy.Function("test")(sympy.sqrt(sympy.exp(x) / x**2)))

    assert raw_mathjson_to_sympy_expr(sympy_expr_to_raw_mathjson(expr)) == expr


def test_round_trips_sympy_sets_to_raw_mathjson() -> None:
    expr = sympy.Union(
        sympy.Interval(-sympy.oo, sympy.Rational(-1, 2)),
        sympy.Interval(sympy.Rational(1, 2), sympy.oo),
    )

    assert raw_mathjson_to_sympy_expr(sympy_expr_to_raw_mathjson(expr)) == expr
    assert raw_mathjson_to_sympy_expr(
        sympy_expr_to_raw_mathjson(sympy.FiniteSet(sympy.EmptySet))
    ) == sympy.FiniteSet(sympy.EmptySet)


@pytest.mark.parametrize(
    ("expr", "expected_mathjson"),
    [
        (sympy.Interval.Lopen(1, 2), ["Interval", ["Open", 1], 2]),
        (sympy.Interval.Ropen(1, 2), ["Interval", 1, ["Open", 2]]),
        (
            sympy.Interval.open(1, 2),
            ["Interval", ["Open", 1], ["Open", 2]],
        ),
    ],
)
def test_serializes_open_interval_endpoints_to_raw_mathjson(
    expr: sympy.Interval,
    expected_mathjson: MathJsonExpression,
) -> None:
    raw_mathjson = sympy_expr_to_raw_mathjson(expr)

    assert json.loads(raw_mathjson) == expected_mathjson
    assert raw_mathjson_to_sympy_expr(raw_mathjson) == expr


def test_converts_open_interval_endpoints() -> None:
    assert mathjson_to_sympy_expr(["Interval", ["Open", 1], 2]) == sympy.Interval.Lopen(
        1, 2
    )
    assert mathjson_to_sympy_expr(["Interval", 1, ["Open", 2]]) == sympy.Interval.Ropen(
        1, 2
    )
    assert mathjson_to_sympy_expr([
        "Interval",
        ["Open", 1],
        ["Open", 2],
    ]) == sympy.Interval.open(1, 2)


def test_converts_native_sympy_unary_functions() -> None:
    x = sympy.Symbol("x")

    cases = [
        ("AiryAi", sympy.airyai(x)),
        ("AiryBi", sympy.airybi(x)),
        ("Conjugate", sympy.conjugate(x)),
        ("Digamma", sympy.digamma(x)),
        ("Erf", sympy.erf(x)),
        ("Erfc", sympy.erfc(x)),
        ("ErfInv", sympy.erfinv(x)),
        ("Factorial2", sympy.factorial2(x)),
        ("Fibonacci", sympy.fibonacci(x)),
        ("FresnelC", sympy.fresnelc(x)),
        ("FresnelS", sympy.fresnels(x)),
        ("Heaviside", sympy.Heaviside(x)),
        ("LambertW", sympy.LambertW(x)),
        ("Sec", sympy.sec(x)),
        ("Sech", sympy.sech(x)),
        ("Subfactorial", sympy.subfactorial(x)),
        ("Zeta", sympy.zeta(x)),
    ]

    for head, expected in cases:
        assert mathjson_to_sympy_expr([head, "x"]) == expected


def test_converts_native_sympy_binary_functions() -> None:
    n = sympy.Symbol("n")
    x = sympy.Symbol("x")

    cases = [
        ("BesselI", sympy.besseli(n, x)),
        ("BesselJ", sympy.besselj(n, x)),
        ("BesselK", sympy.besselk(n, x)),
        ("BesselY", sympy.bessely(n, x)),
        ("Beta", sympy.beta(n, x)),
        ("Binomial", sympy.binomial(n, x)),
        ("Mod", sympy.Mod(n, x)),
        ("PolyGamma", sympy.polygamma(n, x)),
    ]

    for head, expected in cases:
        assert mathjson_to_sympy_expr([head, "n", "x"]) == expected


def test_converts_kronecker_delta_to_native_sympy_function() -> None:
    a = sympy.Symbol("a")
    b = sympy.Symbol("b")

    assert mathjson_to_sympy_expr(["KroneckerDelta", "a", "b"]) == (
        sympy.KroneckerDelta(a, b)
    )


def test_rejects_kronecker_delta_arity_sympy_cannot_represent() -> None:
    with pytest.raises(TypeError, match="expects exactly two arguments"):
        mathjson_to_sympy_expr(["KroneckerDelta", "a"])

    with pytest.raises(TypeError, match="expects exactly two arguments"):
        mathjson_to_sympy_expr(["KroneckerDelta", "a", "b", "c"])


def test_converts_apply_expression() -> None:
    x = sympy.Symbol("x")

    expr = mathjson_to_sympy_expr(["Apply", "f", "x", 2])

    assert expr == sympy.Function("f")(x, 2)


def test_converts_chained_relation() -> None:
    x = sympy.Symbol("x")

    expr = mathjson_to_sympy_expr(["Less", 1, "x", 3])

    assert expr == sympy.And(
        sympy.StrictLessThan(1, x),
        sympy.StrictLessThan(x, 3),
    )


def test_rejects_non_expression_arithmetic_argument() -> None:
    with pytest.raises(MathJsonStudentError, match="numeric expression"):
        mathjson_to_sympy_expr(["Add", ["Set", 1], 2])


def test_converts_mathjson_string_literals() -> None:
    assert mathjson_to_sympy_expr({"str": "hello"}) == Str("hello")
    assert mathjson_to_sympy_expr("'x'") == Str("x")
    assert mathjson_to_sympy_expr("'3.14'") == Str("3.14")
    assert mathjson_to_sympy_expr("Hello World") == Str("Hello World")


def test_converts_bare_string_shorthands_by_mathjson_rules() -> None:
    assert mathjson_to_sympy_expr("x") == sympy.Symbol("x")
    assert mathjson_to_sympy_expr("HelloWorld") == sympy.Symbol("HelloWorld")
    assert mathjson_to_sympy_expr("`x y`") == sympy.Symbol("x y")
    assert mathjson_to_sympy_expr("3.14") == sympy.Float("3.14")
    assert mathjson_to_sympy_expr("0.(3)") == sympy.Rational(1, 3)


def test_rejects_mathjson_dictionary_objects() -> None:
    with pytest.raises(TypeError, match="Unsupported formula editor input"):
        mathjson_to_sympy_expr({"dict": {"x": 1}})


def test_rejects_mathjson_parse_errors() -> None:
    mathjson = [
        "Sequence",
        [
            "InvisibleOperator",
            "x",
            [
                "Error",
                {"str": "unexpected-command"},
                ["LatexString", {"str": "\\left"}],
            ],
        ],
        ["Error", {"str": "unexpected-delimiter"}, ["LatexString", {"str": "("}]],
    ]

    with pytest.raises(MathJsonParseError) as exc_info:
        mathjson_to_sympy_expr(mathjson)

    message = str(exc_info.value)
    assert "unexpected-command" in message
    assert "\\left" in message
    assert "unexpected-delimiter" in message
    assert "(" in message


def test_rejects_mathjson_parse_error_codes() -> None:
    mathjson = [
        "Sequence",
        "x",
        [
            "Error",
            ["ErrorCode", {"str": "unexpected-token"}, {"str": "@"}],
            ["LatexString", {"str": "@"}],
        ],
    ]

    with pytest.raises(MathJsonParseError) as exc_info:
        mathjson_to_sympy_expr(mathjson)

    message = str(exc_info.value)
    assert "unexpected-token" in message
    assert "@" in message
    assert "ErrorCode" not in message


@pytest.mark.parametrize(
    "mathjson",
    [
        [],
        [1, "x"],
        ["Apply"],
        ["Add"],
        ["Divide", "x"],
        ["Power", "x"],
        ["Root", "x"],
        ["Arctan2", "y"],
        ["Not"],
        ["Pair", "x"],
        ["Less", "x"],
        ["Error"],
    ],
)
def test_runtime_checks_reject_invalid_mathjson_shapes_before_conversion(
    mathjson: MathJsonExpression,
) -> None:
    with pytest.raises((TypeError, ValueError)):
        mathjson_to_sympy_expr(mathjson)


def test_rejects_symbol_expressions_that_do_not_convert_to_sympy_symbols() -> None:
    with pytest.raises(TypeError, match="Symbol expects a single symbol argument"):
        mathjson_to_sympy_expr(["Symbol", "x", "y"])

    with pytest.raises(MathJsonStudentError, match="Expected a symbol"):
        mathjson_to_sympy_expr(["Symbol", 1])

    with pytest.raises(MathJsonStudentError, match="Expected a symbol"):
        mathjson_to_sympy_expr(["Symbol", "'x'"])


def test_converts_symbol_expression_shorthands() -> None:
    assert mathjson_to_sympy_expr(["Symbol", "x"]) == sympy.Symbol("x")
    assert mathjson_to_sympy_expr(["Symbol", "`x y`"]) == sympy.Symbol("x y")
    assert mathjson_to_sympy_expr(["Symbol", {"sym": "A\u030a"}]) == sympy.Symbol("Å")


def test_rejects_string_literals_in_algebraic_expression_positions() -> None:
    with pytest.raises(MathJsonStudentError, match="numeric expression"):
        mathjson_to_sympy_expr(["Add", "'test'", 1])
