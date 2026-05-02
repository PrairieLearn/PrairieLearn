import functools
import itertools
import json
import re
import unicodedata
from collections.abc import Callable
from typing import cast

import sympy
import sympy.logic.boolalg
from mathjson import (
    MathJsonBinaryFunctionSymbol,
    MathJsonExpression,
    MathJsonFunctionExpression,
    MathJsonRelationsFunctionSymbol,
    MathJsonUnaryFunctionSymbol,
    MathJsonVariadicFunctionSymbol,
)
from sympy.core.symbol import Str
from validate import validate


class MathJsonParseError(ValueError):
    """Raised when a validated MathJSON expression contains parser errors."""


_CONSTANTS: dict[str, sympy.Basic] = {
    "CatalanConstant": sympy.Catalan,
    "ComplexInfinity": sympy.zoo,
    "e": sympy.E,
    "EmptySet": sympy.S.EmptySet,
    "EulerGamma": sympy.EulerGamma,
    "ExponentialE": sympy.E,
    "False": sympy.S.false,
    "GoldenRatio": sympy.GoldenRatio,
    "Half": sympy.Rational(1, 2),
    "i": sympy.I,
    "ImaginaryUnit": sympy.I,
    "NaN": sympy.nan,
    "NegativeInfinity": -sympy.oo,
    "Pi": sympy.pi,
    "PositiveInfinity": sympy.oo,
    "True": sympy.S.true,
}

# PEP0764 PLEASE
# Pylance follows SymPy's dynamic Function.__new__ annotations too literally
# for these function classes, so narrow their results after invocation.
_UNARY_FUNCTIONS: dict[MathJsonUnaryFunctionSymbol, Callable[[sympy.Expr], object]] = {
    "Abs": sympy.Abs,
    "AiryAi": sympy.airyai,
    "AiryBi": sympy.airybi,
    "Arccos": sympy.acos,
    "Arccot": sympy.acot,
    "Arccsc": sympy.acsc,
    "Arcosh": sympy.acosh,
    "Arcoth": sympy.acoth,
    "Arcsch": sympy.acsch,
    "Arcsec": sympy.asec,
    "Arcsin": sympy.asin,
    "Arctan": sympy.atan,
    "Arsech": sympy.asech,
    "Arsinh": sympy.asinh,
    "Artanh": sympy.atanh,
    "Ceil": sympy.ceiling,
    "Cos": sympy.cos,
    "Cosh": sympy.cosh,
    "Cot": sympy.cot,
    "Coth": sympy.coth,
    "Csc": sympy.csc,
    "Csch": sympy.csch,
    "Conjugate": sympy.conjugate,
    "Denominator": sympy.denom,
    "Digamma": sympy.digamma,
    "Erf": sympy.erf,
    "Erfc": sympy.erfc,
    "ErfInv": sympy.erfinv,
    "Exp": sympy.exp,
    "Exp2": lambda x: sympy.Pow(2, x),
    "Factorial": sympy.factorial,
    "Factorial2": sympy.factorial2,
    "Fibonacci": sympy.fibonacci,
    "Floor": sympy.floor,
    "FresnelC": sympy.fresnelc,
    "FresnelS": sympy.fresnels,
    "Gamma": sympy.gamma,
    "GammaLn": sympy.loggamma,
    "Heaviside": sympy.Heaviside,
    "Imaginary": sympy.im,
    "Lb": lambda x: sympy.log(x, 2),
    "LambertW": sympy.LambertW,
    "Lg": lambda x: sympy.log(x, 10),
    "Log10": lambda x: sympy.log(x, 10),
    "Log2": lambda x: sympy.log(x, 2),
    "Negate": lambda x: sympy.Mul(-1, x),
    "Numerator": sympy.numer,
    "Real": sympy.re,
    "Sec": sympy.sec,
    "Sech": sympy.sech,
    "Sign": sympy.sign,
    "Sin": sympy.sin,
    "Sinc": sympy.sinc,
    "Sinh": sympy.sinh,
    "Sqrt": sympy.sqrt,
    "Square": lambda x: sympy.Pow(x, 2),
    "Subfactorial": sympy.subfactorial,
    "Tan": sympy.tan,
    "Tanh": sympy.tanh,
    "Zeta": sympy.zeta,
}

_BINARY_FUNCTIONS: dict[
    MathJsonBinaryFunctionSymbol, Callable[[sympy.Expr, sympy.Expr], object]
] = {
    "BesselI": sympy.besseli,
    "BesselJ": sympy.besselj,
    "BesselK": sympy.besselk,
    "BesselY": sympy.bessely,
    "Beta": sympy.beta,
    "Binomial": sympy.binomial,
    "Mod": sympy.Mod,
    "PolyGamma": sympy.polygamma,
}

_VARIADIC_FUNCTIONS: dict[
    MathJsonVariadicFunctionSymbol, Callable[..., sympy.Basic]
] = {
    "And": sympy.And,
    "GCD": sympy.gcd,
    "LCM": sympy.lcm,
    "Max": sympy.Max,
    "Min": sympy.Min,
    "Or": sympy.Or,
    "Xor": sympy.Xor,
}

_RELATIONS: dict[
    MathJsonRelationsFunctionSymbol, Callable[[sympy.Expr, sympy.Expr], sympy.Basic]
] = {
    "Equal": sympy.Eq,
    "Greater": sympy.StrictGreaterThan,
    "GreaterEqual": sympy.GreaterThan,
    "Less": sympy.StrictLessThan,
    "LessEqual": sympy.LessThan,
    "NotEqual": sympy.Ne,
}

_SYMPY_FUNCTIONS: dict[object, str] = {
    sympy.Abs: "Abs",
    sympy.acos: "Arccos",
    sympy.acot: "Arccot",
    sympy.acsc: "Arccsc",
    sympy.acosh: "Arcosh",
    sympy.acoth: "Arcoth",
    sympy.acsch: "Arcsch",
    sympy.asec: "Arcsec",
    sympy.asin: "Arcsin",
    sympy.atan: "Arctan",
    sympy.asech: "Arsech",
    sympy.asinh: "Arsinh",
    sympy.atanh: "Artanh",
    sympy.ceiling: "Ceil",
    sympy.cos: "Cos",
    sympy.cosh: "Cosh",
    sympy.cot: "Cot",
    sympy.coth: "Coth",
    sympy.csc: "Csc",
    sympy.csch: "Csch",
    sympy.exp: "Exp",
    sympy.factorial: "Factorial",
    sympy.floor: "Floor",
    sympy.gamma: "Gamma",
    sympy.log: "Log",
    sympy.sec: "Sec",
    sympy.sech: "Sech",
    sympy.sign: "Sign",
    sympy.sin: "Sin",
    sympy.sinc: "Sinc",
    sympy.sinh: "Sinh",
    sympy.sqrt: "Sqrt",
    sympy.tan: "Tan",
    sympy.tanh: "Tanh",
}

_NUMBER_RE = re.compile(
    r"^[+-]?(0|[1-9][0-9]*)(\.[0-9]+)?(\([0-9]+\))?([eE][+-]?[0-9]+)?$"
)
_REPEATING_DECIMAL_RE = re.compile(
    r"^(?P<sign>[+-]?)(?P<whole>0|[1-9][0-9]*)"
    r"(?:\.(?P<nonrepeating>[0-9]*))?"
    r"\((?P<repeating>[0-9]+)\)"
    r"(?P<exponent>[eE][+-]?[0-9]+)?$"
)
_SPECIAL_NUMBER_RE = re.compile(
    r"^(nan|oo|\+oo|-oo|infinity|\+infinity|-infinity)$", re.IGNORECASE
)
_SYMBOL_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def raw_mathjson_to_sympy_expr(raw: str) -> sympy.Basic:
    """Parse raw MathJSON JSON text and convert it to a SymPy object.

    Examples:
        ``'["Add", "x", 1]'`` becomes ``x + 1``.

    Args:
        raw: JSON text containing a MathJSON expression.

    Returns:
        The converted SymPy object.
    """
    return mathjson_to_sympy_expr(json.loads(raw))


def sympy_expr_to_raw_mathjson(expr: sympy.Basic) -> str:
    """Convert a supported SymPy object to raw MathJSON JSON text.

    This is not a complete SymPy-to-MathJSON serializer. It only emits the
    MathJSON subset needed to generate formula-editor test submissions from the
    SymPy objects that `pl-symbolic-input.test()` creates.

    Examples:
        ``x + 1`` becomes ``'["Add", 1, "x"]'``.
        ``FiniteSet(1, 2)`` becomes ``'["Set", 1, 2]'``.

    Args:
        expr: A SymPy object in the supported subset. Unsupported SymPy objects
            raise ``TypeError``.

    Returns:
        JSON text containing a MathJSON expression.
    """
    return json.dumps(_sympy_expr_to_mathjson(expr))


def mathjson_to_sympy_expr(expr: object) -> sympy.Basic:
    """Validate a deserialized MathJSON value and convert it to a SymPy object.

    Examples:
        ``["Add", "x", 1]`` becomes ``x + 1``.
        ``{"str": "hello"}`` becomes ``Str("hello")``.

    Args:
        expr: A deserialized MathJSON value.

    Returns:
        The converted SymPy object.
    """
    validated: MathJsonExpression = validate(expr, MathJsonExpression)
    _raise_mathjson_errors(validated)
    return _mathjson_to_sympy_expr(validated)


def _sympy_expr_to_mathjson(expr: sympy.Basic) -> MathJsonExpression:
    match expr:
        case sympy.S.true:
            return True
        case sympy.S.false:
            return False
        case sympy.S.NaN:
            return "NaN"
        case sympy.S.Infinity:
            return "PositiveInfinity"
        case sympy.S.NegativeInfinity:
            return "NegativeInfinity"
        case sympy.S.ComplexInfinity:
            return "ComplexInfinity"
        case sympy.S.EmptySet:
            return "EmptySet"
        case sympy.S.Exp1:
            return "ExponentialE"
        case sympy.S.Pi:
            return "Pi"
        case sympy.S.ImaginaryUnit:
            return "ImaginaryUnit"
        case _:
            pass

    if isinstance(expr, sympy.Integer):
        return int(expr)
    if isinstance(expr, sympy.Rational):
        return ("Rational", int(expr.p), int(expr.q))
    if isinstance(expr, sympy.Float):
        return {"num": str(expr)}
    if isinstance(expr, sympy.Symbol):
        return _sympy_symbol_to_mathjson(expr.name)
    if isinstance(expr, sympy.Add):
        return _mathjson_function(
            "Add", *(_sympy_expr_to_mathjson(arg) for arg in expr.args)
        )
    if isinstance(expr, sympy.Mul):
        return _mathjson_function(
            "Multiply", *(_sympy_expr_to_mathjson(arg) for arg in expr.args)
        )
    if isinstance(expr, sympy.Pow):
        return _mathjson_function(
            "Power",
            _sympy_expr_to_mathjson(expr.base),
            _sympy_expr_to_mathjson(expr.exp),
        )
    if isinstance(expr, sympy.FiniteSet):
        return _mathjson_function(
            "Set", *(_sympy_expr_to_mathjson(arg) for arg in expr.args)
        )
    if isinstance(expr, sympy.Union):
        return _mathjson_function(
            "Union", *(_sympy_expr_to_mathjson(arg) for arg in expr.args)
        )
    if isinstance(expr, sympy.Intersection):
        return _mathjson_function(
            "Intersection",
            *(_sympy_expr_to_mathjson(arg) for arg in expr.args),
        )
    if isinstance(expr, sympy.Interval):
        return _mathjson_function(
            "Interval",
            _sympy_expr_to_mathjson(expr.start),
            _sympy_expr_to_mathjson(expr.end),
        )
    if expr.is_Function:
        head = _SYMPY_FUNCTIONS.get(expr.func)
        args = tuple(_sympy_expr_to_mathjson(arg) for arg in expr.args)
        if head is not None:
            return _mathjson_function(head, *args)
        return _mathjson_function(
            "Apply", _sympy_symbol_to_mathjson(expr.func.__name__), *args
        )

    raise TypeError(f"unsupported SymPy object: {expr}")


def _mathjson_to_sympy_expr(expr: MathJsonExpression) -> sympy.Basic:
    if expr is True:
        return sympy.S.true
    if expr is False:
        return sympy.S.false
    if isinstance(expr, int):
        return sympy.Integer(expr)
    if isinstance(expr, float):
        return sympy.Float(expr)
    if isinstance(expr, str):
        return _string_number_or_symbol(expr)

    if isinstance(expr, dict):
        if "num" in expr:
            return _number(expr["num"])
        if "sym" in expr:
            return _symbol(expr["sym"])
        if "fn" in expr:
            return _function(expr["fn"])
        if "str" in expr:
            return _string(expr["str"])
        if "dict" in expr:
            raise TypeError("MathJSON dictionary objects cannot be converted to SymPy")
        raise AssertionError("validated MathJSON object has no conversion branch")

    return _function(expr)


def _number(value: str) -> sympy.Basic:
    normalized_value = _normalize_number(value)

    match normalized_value:
        case "NaN":
            return sympy.nan
        case "Infinity" | "+Infinity" | "oo" | "+oo":
            return sympy.oo
        case "-Infinity" | "-oo":
            return -sympy.oo
        case _:
            pass

    repeating = _REPEATING_DECIMAL_RE.match(normalized_value)
    if repeating is not None:
        sign = -1 if repeating["sign"] == "-" else 1
        whole = int(repeating["whole"])
        nonrepeating = repeating["nonrepeating"] or ""
        repeating_digits = repeating["repeating"]

        nonrepeating_value = int(nonrepeating) if nonrepeating else 0
        nonrepeating_scale = 10 ** len(nonrepeating)
        repeating_scale = 10 ** len(repeating_digits) - 1

        ret = sign * (
            sympy.Integer(whole)
            + sympy.Rational(nonrepeating_value, nonrepeating_scale)
            + sympy.Rational(
                int(repeating_digits), nonrepeating_scale * repeating_scale
            )
        )

        exponent = repeating["exponent"]
        if exponent is not None:
            ret *= sympy.Integer(10) ** int(exponent[1:])
        return ret

    return sympy.Number(normalized_value)


def _symbol(name: str) -> sympy.Basic:
    normalized_name = _normalize_symbol(name)
    return _CONSTANTS.get(normalized_name, sympy.Symbol(normalized_name))


def _string(value: str) -> sympy.Basic:
    return Str(value)


def _string_number_or_symbol(value: str) -> sympy.Basic:
    string_value = _string_value(value)
    if string_value is not None:
        return _string(string_value)
    if _matches_number(value):
        return _number(value)
    return _symbol(_symbol_shorthand_value(value))


def _function(expr: MathJsonFunctionExpression) -> sympy.Basic:
    head = expr[0]

    match expr:
        case ("Error", *_):
            raise MathJsonParseError(f"MathJSON parse error: {_format_error(expr)}")
        case ("Symbol", symbol_expr):
            symbol_name = _symbol_name(symbol_expr)
            return sympy.Symbol(symbol_name)
        case ("Symbol", *_):
            raise TypeError("Symbol expects a single symbol argument")
        case ("String", *_):
            raise TypeError("MathJSON string expressions cannot be converted to SymPy")
        case ("Apply", symbol_expr, *apply_args):
            return _undefined_function(_symbol_name(symbol_expr))(
                *_as_exprs(tuple(_mathjson_to_sympy_expr(arg) for arg in apply_args))
            )
        case _:
            pass

    args = tuple(_mathjson_to_sympy_expr(arg) for arg in expr[1:])

    match head:
        case "Add":
            return sympy.Add(*_as_exprs(args))
        case "Subtract":
            if len(args) == 1:
                return sympy.Mul(-1, _as_expr(args[0]))
            left, *rest = args
            return sympy.Add(_as_expr(left), *(-_as_expr(arg) for arg in rest))
        case "Multiply":
            return sympy.Mul(*_as_exprs(args))
        case "Divide":
            return functools.reduce(_divide, args)
        case "Power":
            return sympy.Pow(_as_expr(args[0]), _as_expr(args[1]))
        case "Root":
            return sympy.root(_as_expr(args[0]), _as_expr(args[1]))
        case "Rational":
            if len(args) == 1:
                return sympy.Rational(_as_expr(args[0]))
            return sympy.Rational(_as_expr(args[0]), _as_expr(args[1]))
        case "Arctan2":
            return _as_sympy_basic(sympy.atan2(_as_expr(args[0]), _as_expr(args[1])))
        case "Log" | "Ln":
            if len(args) == 1:
                return _as_sympy_basic(sympy.log(_as_expr(args[0])))
            return _as_sympy_basic(sympy.log(_as_expr(args[0]), _as_expr(args[1])))
        case "Not":
            return sympy.Not(_as_boolean(args[0]))
        case "List" | "Tuple":
            return sympy.Tuple(*args)
        case "Single":
            return sympy.Tuple(args[0])
        case "Pair":
            return sympy.Tuple(args[0], args[1])
        case "Triple":
            return sympy.Tuple(args[0], args[1], args[2])
        case "Set":
            return sympy.FiniteSet(*args)
        case "Union":
            return sympy.Union(*args)
        case "Intersection":
            return sympy.Intersection(*args)
        case "Interval":
            return sympy.Interval(_as_expr(args[0]), _as_expr(args[1]))
        case _:
            pass

    if head in _UNARY_FUNCTIONS:
        return _as_sympy_basic(_UNARY_FUNCTIONS[head](_as_expr(args[0])))

    if head in _BINARY_FUNCTIONS:
        return _as_sympy_basic(
            _BINARY_FUNCTIONS[head](_as_expr(args[0]), _as_expr(args[1]))
        )

    if head == "KroneckerDelta":
        if len(args) != 2:
            raise TypeError("KroneckerDelta expects exactly two arguments")
        return _as_sympy_basic(sympy.KroneckerDelta(*_as_exprs(args)))

    if head in _VARIADIC_FUNCTIONS:
        return _VARIADIC_FUNCTIONS[head](*args)

    if head in _RELATIONS:
        return _relation(head, args)

    return _undefined_function(head)(*args)


def _divide(left: sympy.Basic, right: sympy.Basic) -> sympy.Basic:
    return sympy.Mul(_as_expr(left), sympy.Pow(_as_expr(right), -1))


def _relation(
    head: MathJsonRelationsFunctionSymbol, args: tuple[sympy.Basic, ...]
) -> sympy.Basic:
    relation = _RELATIONS[head]
    return sympy.And(
        *(
            _as_boolean(relation(_as_expr(left), _as_expr(right)))
            for left, right in itertools.pairwise(args)
        )
    )


def _raise_mathjson_errors(expr: MathJsonExpression) -> None:
    errors = _collect_mathjson_errors(expr)
    if len(errors) == 1:
        raise MathJsonParseError(f"MathJSON parse error: {errors[0]}")
    if len(errors) > 1:
        raise MathJsonParseError(f"MathJSON parse errors: {'; '.join(errors)}")


def _collect_mathjson_errors(expr: MathJsonExpression) -> list[str]:
    if isinstance(expr, bool | int | float | str):
        return []

    if isinstance(expr, dict):
        if "fn" in expr:
            return _collect_mathjson_errors(expr["fn"])
        return []

    match expr:
        case ("Error", *_):
            return [_format_error(expr)]
        case _:
            pass

    return [error for arg in expr[1:] for error in _collect_mathjson_errors(arg)]


def _format_error(expr: MathJsonFunctionExpression) -> str:
    match expr:
        case ("Error", code_expr):
            return _format_error_part(code_expr)
        case ("Error", code_expr, detail_expr):
            code = _format_error_part(code_expr)
            detail = _format_error_part(detail_expr)
            return f"{code}: {detail}"
        case _:
            raise AssertionError("validated MathJSON error has no error branch")


def _format_error_part(expr: MathJsonExpression) -> str:
    if isinstance(expr, bool | int | float):
        return str(expr)
    if isinstance(expr, str):
        return _strip_mathjson_string_quotes(expr)

    if isinstance(expr, dict):
        if "str" in expr:
            return _strip_mathjson_string_quotes(expr["str"])
        if "sym" in expr:
            return _strip_mathjson_string_quotes(expr["sym"])
        if "num" in expr:
            return expr["num"]
        if "fn" in expr:
            return _format_error_part(expr["fn"])
        return repr(expr)

    match expr:
        case ("LatexString", value):
            return _format_error_part(value)
        case ("Error", *_):
            return _format_error(expr)
        case _:
            pass

    return repr(expr)


def _strip_mathjson_string_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _matches_number(value: str) -> bool:
    return (
        _SPECIAL_NUMBER_RE.fullmatch(value) is not None
        or _NUMBER_RE.fullmatch(value) is not None
        or _REPEATING_DECIMAL_RE.fullmatch(value) is not None
    )


def _matches_symbol(value: str) -> bool:
    return _SYMBOL_RE.fullmatch(value) is not None or (
        len(value) >= 2 and value[0] == "`" and value[-1] == "`"
    )


def _mathjson_function(head: str, *args: MathJsonExpression) -> MathJsonExpression:
    return cast(MathJsonExpression, (head, *args))


def _sympy_symbol_to_mathjson(name: str) -> MathJsonExpression:
    if _matches_symbol(name) and not _matches_number(name):
        return _normalize_symbol(name)
    return {"sym": _normalize_symbol(name)}


def _string_value(value: str) -> str | None:
    if len(value) >= 2 and value[0] == "'" and value[-1] == "'":
        return value[1:-1]
    if not _matches_number(value) and not _matches_symbol(value):
        return value
    return None


def _symbol_shorthand_value(value: str) -> str:
    if len(value) >= 2 and value[0] == "`" and value[-1] == "`":
        return value[1:-1]
    return value


def _normalize_symbol(value: str) -> str:
    return unicodedata.normalize("NFC", value)


def _normalize_number(value: str) -> str:
    value = re.sub(r"[\u0009-\u000d\u0020\u00a0]", "", value)
    match value.lower():
        case "nan":
            return "NaN"
        case "infinity" | "+infinity" | "oo" | "+oo":
            return "+Infinity"
        case "-infinity" | "-oo":
            return "-Infinity"
        case _:
            return value


def _as_expr(value: sympy.Basic) -> sympy.Expr:
    """Require a scalar-ish SymPy expression for algebraic operators."""
    # MathJSON operands are typed as generic expressions, so values like sets
    # and tuples can validate structurally but still be invalid in `Add`,
    # `Power`, `Sin`, and similar SymPy expression positions. SymPy's `Expr`
    # hierarchy is the practical boundary here: it excludes containers like
    # `FiniteSet` and non-algebraic atoms like `Str`, which SymPy deprecates in
    # `Add`/`Mul` and does not handle consistently.
    if not isinstance(value, sympy.Expr):
        raise TypeError(f"expected SymPy expression, got {type(value)}")
    return value


def _as_exprs(values: tuple[sympy.Basic, ...]) -> tuple[sympy.Expr, ...]:
    """Require every value to satisfy `_as_expr`."""
    return tuple(_as_expr(value) for value in values)


def _as_boolean(value: sympy.Basic) -> sympy.logic.boolalg.Boolean:
    """Require a SymPy boolean for logical operators."""
    if not isinstance(value, sympy.logic.boolalg.Boolean):
        raise TypeError(f"expected SymPy boolean, got {type(value)}")
    return value


def _as_sympy_basic(value: object) -> sympy.Basic:
    """Narrow dynamic SymPy factory results back to SymPy objects."""
    # Keep SymPy's dynamic function factories behind a runtime check instead
    # of teaching Pylance that every factory call is statically precise.
    if not isinstance(value, sympy.Basic):
        raise TypeError(f"expected SymPy object, got {type(value)}")
    return value


def _symbol_name(expr: MathJsonExpression) -> str:
    if isinstance(expr, str) and _matches_symbol(expr):
        return _normalize_symbol(_symbol_shorthand_value(expr))
    if isinstance(expr, dict) and "sym" in expr:
        return _normalize_symbol(expr["sym"])
    raise TypeError("expected a MathJSON symbol expression")


def _undefined_function(name: str) -> Callable[..., sympy.Basic]:
    # sympy.Function(name) returns a callable undefined function class at
    # runtime, but Pylance reports the intermediate class as the final value.
    return cast(Callable[..., sympy.Basic], sympy.Function(name))


__all__ = [
    "MathJsonParseError",
    "mathjson_to_sympy_expr",
    "raw_mathjson_to_sympy_expr",
    "sympy_expr_to_raw_mathjson",
]
