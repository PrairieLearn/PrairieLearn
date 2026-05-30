import functools
import itertools
import json
import re
import unicodedata
from collections.abc import Callable, Collection, Iterable
from typing import cast

import sympy
import sympy.logic.boolalg
from mathjson import ExpressionObject, MathJsonExpression, MathJsonFunctionExpression
from sympy.core.symbol import Str


class MathJsonStudentError(Exception):
    """Raised when a MathJSON failure message is safe to show to students."""


class MathJsonParseError(MathJsonStudentError, ValueError):
    """Raised when a MathJSON expression contains parser errors."""


class MathJsonConversionError(MathJsonStudentError, TypeError):
    """Raised when well-formed MathJSON cannot be converted to supported SymPy."""


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
_UNARY_FUNCTIONS: dict[str, Callable[[sympy.Expr], object]] = {
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

_BINARY_FUNCTIONS: dict[str, Callable[[sympy.Expr, sympy.Expr], object]] = {
    "BesselI": sympy.besseli,
    "BesselJ": sympy.besselj,
    "BesselK": sympy.besselk,
    "BesselY": sympy.bessely,
    "Beta": sympy.beta,
    "Binomial": sympy.binomial,
    "Mod": sympy.Mod,
    "PolyGamma": sympy.polygamma,
}

_VARIADIC_FUNCTIONS: dict[str, Callable[..., sympy.Basic]] = {
    "And": sympy.And,
    "GCD": sympy.gcd,
    "LCM": sympy.lcm,
    "Max": sympy.Max,
    "Min": sympy.Min,
    "Or": sympy.Or,
    "Xor": sympy.Xor,
}

_RELATIONS: dict[str, Callable[[sympy.Expr, sympy.Expr], sympy.Basic]] = {
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


def raw_mathjson_to_sympy_expr(
    raw: str, *, allow_sets: bool = False, allow_trig: bool = True
) -> sympy.Basic:
    """Parse raw MathJSON JSON text and convert it to a SymPy object.

    Examples:
        ``'["Add", "x", 1]'`` becomes ``x + 1``.

    Args:
        raw: JSON text containing a MathJSON expression.
        allow_sets: If true:
            - ``["List", e1, e2]`` -> ``["Interval", e1, e2]``,
            - ``["Delimiter", ["Sequence", e1, e2], {"str": "(,)"}]`` ->
              ``["Interval", [ "Open", e1], ["Open", e2]]``,
            - ``["Delimiter", ["Sequence", *args], {"str": ","}]`` -> ``["Set", *args]``.
        allow_trig: If false, raises on trig functions.

    Returns:
        The converted SymPy object.
    """
    return mathjson_to_sympy_expr(
        json.loads(raw), allow_sets=allow_sets, allow_trig=allow_trig
    )


def mathjson_to_sympy_expr(
    expr: object, *, allow_sets: bool = False, allow_trig: bool = True
) -> sympy.Basic:
    """Check a deserialized MathJSON value and convert it to a SymPy object.

    Examples:
        ``["Add", "x", 1]`` becomes ``x + 1``.
        ``{"str": "hello"}`` becomes ``Str("hello")``.

    Args:
        expr: A deserialized MathJSON value.
        allow_sets: If true:
            - ``["List", e1, e2]`` -> ``["Interval", e1, e2]``,
            - ``["Delimiter", ["Sequence", e1, e2], {"str": "(,)"}]`` ->
              ``["Interval", [ "Open", e1], ["Open", e2]]``,
            - ``["Delimiter", ["Sequence", *args], {"str": ","}]`` -> ``["Set", *args]``
        allow_trig: If false, raises on trig functions.

    Returns:
        The converted SymPy object.
    """
    # pretend that expr is in the shape of MathJsonExpression
    expr = cast(MathJsonExpression, expr)
    _raise_mathjson_errors(expr, allow_trig=allow_trig)
    return _mathjson_to_sympy_expr(expr, allow_sets=allow_sets)


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
        case sympy.Integer():
            return int(expr)
        case sympy.Rational():
            return ["Rational", int(expr.p), int(expr.q)]
        case sympy.Float():
            return {"num": str(expr)}
        case sympy.Symbol():
            return _sympy_symbol_to_mathjson(expr.name)
        case sympy.Add():
            return _mathjson_function(
                "Add", *(_sympy_expr_to_mathjson(arg) for arg in expr.args)
            )
        case sympy.Mul():
            return _mathjson_function(
                "Multiply", *(_sympy_expr_to_mathjson(arg) for arg in expr.args)
            )
        case sympy.Pow():
            return _mathjson_function(
                "Power",
                _sympy_expr_to_mathjson(expr.base),
                _sympy_expr_to_mathjson(expr.exp),
            )
        case sympy.FiniteSet():
            return _mathjson_function(
                "Set", *(_sympy_expr_to_mathjson(arg) for arg in expr.args)
            )
        case sympy.Union():
            return _mathjson_function(
                "Union", *(_sympy_expr_to_mathjson(arg) for arg in expr.args)
            )
        case sympy.Intersection():
            return _mathjson_function(
                "Intersection",
                *(_sympy_expr_to_mathjson(arg) for arg in expr.args),
            )
        case sympy.Interval():
            return _mathjson_function(
                "Interval",
                ["Open", _sympy_expr_to_mathjson(expr.start)]
                if expr.left_open
                else _sympy_expr_to_mathjson(expr.start),
                ["Open", _sympy_expr_to_mathjson(expr.end)]
                if expr.right_open
                else _sympy_expr_to_mathjson(expr.end),
            )
        case _ if expr.is_Function:
            head = _SYMPY_FUNCTIONS.get(expr.func)
            args = tuple(_sympy_expr_to_mathjson(arg) for arg in expr.args)
            if head is not None:
                return _mathjson_function(head, *args)
            return _mathjson_function(
                "Apply", _sympy_symbol_to_mathjson(expr.func.__name__), *args
            )
        case _:
            pass

    raise TypeError(f"unsupported SymPy object: {expr}")


def _mathjson_to_sympy_expr(
    expr: MathJsonExpression, *, allow_sets: bool = False
) -> sympy.Basic:
    match expr:
        case True:
            return sympy.S.true
        case False:
            return sympy.S.false
        case int(value):
            return sympy.Integer(value)
        case float(value):
            return sympy.Float(value)
        case str(value):
            return _string_number_or_symbol(value)
        case {}:
            return _mathjson_object_to_sympy_expr(
                cast(ExpressionObject, expr), allow_sets=allow_sets
            )
        case [*_]:
            return _function(expr, allow_sets=allow_sets)
        case _:
            raise MathJsonConversionError("Invalid MathJSON expression.")


def _mathjson_object_to_sympy_expr(
    expr: ExpressionObject, *, allow_sets: bool = False
) -> sympy.Basic:
    match expr:
        case {"num": str(num)}:
            return _number(num)
        case {"num": _}:
            raise MathJsonConversionError(
                "MathJSON number object expects a string value."
            )
        case {"sym": str(sym)}:
            return _symbol(sym)
        case {"sym": _}:
            raise MathJsonConversionError(
                "MathJSON symbol object expects a string value."
            )
        case {"fn": fn}:
            return _function(fn, allow_sets=allow_sets)
        case {"str": str(string)}:
            return _string(string)
        case {"str": _}:
            raise MathJsonConversionError(
                "MathJSON string object expects a string value."
            )
        case {"dict": _}:
            raise MathJsonConversionError(
                "MathJSON dictionary objects cannot be converted to SymPy."
            )
        case _:
            raise MathJsonConversionError("Unsupported MathJSON object.")


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


def _function(
    expr: MathJsonFunctionExpression, *, allow_sets: bool = False
) -> sympy.Basic:
    if not isinstance(expr, list | tuple):
        raise MathJsonConversionError("Expected MathJSON function expression.")
    if len(expr) == 0:
        raise MathJsonConversionError("MathJSON function expression cannot be empty.")

    head = expr[0]
    if not isinstance(head, str):
        raise MathJsonConversionError("MathJSON function head must be a string.")

    raw_args = tuple(expr[1:])

    match expr:
        case ["Interval", *raw_args]:
            return _interval(head, raw_args, allow_sets=allow_sets)
        case ["List", *raw_args] | [
            "Delimiter",
            ["Sequence", *raw_args],
            {"str": "(,)"},
        ] if allow_sets:
            return _interval(head, raw_args, allow_sets=allow_sets)
        case [
            "Delimiter",
            ["Sequence", *raw_args],
            {"str": ","},
        ] if allow_sets:
            return sympy.FiniteSet(
                *(
                    _mathjson_to_sympy_expr(arg, allow_sets=allow_sets)
                    for arg in raw_args
                )
            )
        case _:
            pass

    match head:
        case "Error":
            _require_arity(head, raw_args, 1, 2)
            raise MathJsonParseError(f"MathJSON parse error: {_format_error(expr)}")
        case "Symbol":
            if len(raw_args) != 1:
                raise MathJsonConversionError(
                    "Symbol expects a single symbol argument."
                )
            symbol_name = _symbol_name(raw_args[0])
            return sympy.Symbol(symbol_name)
        case "String":
            raise MathJsonConversionError(
                "MathJSON string expressions cannot be converted to SymPy."
            )
        case "Apply":
            _require_arity(head, raw_args, 1, None)
            symbol_expr, *apply_args = raw_args
            return _undefined_function(_symbol_name(symbol_expr))(
                *_as_exprs(
                    tuple(
                        _mathjson_to_sympy_expr(arg, allow_sets=allow_sets)
                        for arg in apply_args
                    )
                )
            )
        case _:
            pass

    args = tuple(
        _mathjson_to_sympy_expr(arg, allow_sets=allow_sets) for arg in raw_args
    )

    match head:
        case "Add":
            _require_arity(head, args, 1, None)
            return sympy.Add(*_as_exprs(args))
        case "Subtract":
            _require_arity(head, args, 1, None)
            if len(args) == 1:
                return sympy.Mul(-1, _as_expr(args[0]))
            if allow_sets and all(isinstance(arg, sympy.Set) for arg in args):
                return functools.reduce(sympy.Complement, args)
            left, *rest = args
            return sympy.Add(_as_expr(left), *(-_as_expr(arg) for arg in rest))
        # Invisible operation is always interpreted as multiplication
        case "Multiply" | "InvisibleOperator":
            _require_arity(head, args, 1, None)
            return sympy.Mul(*_as_exprs(args))
        case "Divide":
            _require_arity(head, args, 2, None)
            return functools.reduce(_divide, args)
        case "Power":
            _require_arity(head, args, 2)
            return sympy.Pow(_as_expr(args[0]), _as_expr(args[1]))
        case "Root":
            _require_arity(head, args, 2)
            return sympy.root(_as_expr(args[0]), _as_expr(args[1]))
        case "Rational":
            _require_arity(head, args, 1, 2)
            if len(args) == 1:
                return sympy.Rational(_as_expr(args[0]))
            return sympy.Rational(_as_expr(args[0]), _as_expr(args[1]))
        case "Arctan2":
            _require_arity(head, args, 2)
            return _as_sympy_basic(sympy.atan2(_as_expr(args[0]), _as_expr(args[1])))
        case "Log" | "Ln":
            _require_arity(head, args, 1, 2)
            if len(args) == 1:
                return _as_sympy_basic(sympy.log(_as_expr(args[0])))
            return _as_sympy_basic(sympy.log(_as_expr(args[0]), _as_expr(args[1])))
        case "Not":
            _require_arity(head, args, 1)
            return sympy.Not(_as_boolean(args[0]))
        case "List" | "Tuple":
            return sympy.Tuple(*args)
        case "Single":
            _require_arity(head, args, 1)
            return sympy.Tuple(args[0])
        case "Pair":
            _require_arity(head, args, 2)
            return sympy.Tuple(args[0], args[1])
        case "Triple":
            _require_arity(head, args, 3)
            return sympy.Tuple(args[0], args[1], args[2])
        case "Set":
            return sympy.FiniteSet(*args)
        case "Union":
            _require_arity(head, args, 1, None)
            return sympy.Union(*args)
        case "Intersection":
            _require_arity(head, args, 1, None)
            return sympy.Intersection(*args)
        case _:
            pass

    if head in _UNARY_FUNCTIONS:
        _require_arity(head, args, 1)
        return _as_sympy_basic(_UNARY_FUNCTIONS[head](_as_expr(args[0])))

    if head in _BINARY_FUNCTIONS:
        _require_arity(head, args, 2)
        return _as_sympy_basic(
            _BINARY_FUNCTIONS[head](_as_expr(args[0]), _as_expr(args[1]))
        )

    if head == "KroneckerDelta":
        if len(args) != 2:
            raise MathJsonConversionError(
                "KroneckerDelta expects exactly two arguments."
            )
        return _as_sympy_basic(sympy.KroneckerDelta(*_as_exprs(args)))

    if head in _VARIADIC_FUNCTIONS:
        _require_arity(head, args, 1, None)
        return _VARIADIC_FUNCTIONS[head](*args)

    if head in _RELATIONS:
        _require_arity(head, args, 2, None)
        return _relation(head, args)

    return _undefined_function(head)(*args)


def _interval(
    head: str, raw_args: list[MathJsonExpression], *, allow_sets: bool = False
) -> sympy.Basic:
    _require_arity(head, raw_args, 2)
    start_arg, start_open = _interval_endpoint(raw_args[0])
    end_arg, end_open = _interval_endpoint(raw_args[1])
    start, end = _as_exprs((
        _mathjson_to_sympy_expr(start_arg, allow_sets=allow_sets),
        _mathjson_to_sympy_expr(end_arg, allow_sets=allow_sets),
    ))

    match head, start_open, end_open:
        case "Delimiter", _, _:
            return sympy.Interval.open(start, end)
        case "Interval", True, True:
            return sympy.Interval.open(start, end)
        case "Interval", True, False:
            return sympy.Interval.Lopen(start, end)
        case "Interval", False, True:
            return sympy.Interval.Ropen(start, end)
        case (("Interval" | "List"), False, False):
            return sympy.Interval(start, end)
        case _:
            raise MathJsonConversionError("Could not construct interval.")


def _interval_endpoint(expr: MathJsonExpression) -> tuple[MathJsonExpression, bool]:
    match expr:
        case ["Open", endpoint]:
            return endpoint, True
        case ["Open", *_]:
            raise MathJsonConversionError(
                "Open interval endpoint expects exactly one argument."
            )
        case _:
            return expr, False


def _require_arity(
    head: str,
    args: Collection[object],
    min_count: int,
    max_count: int | None = -1,
) -> None:
    if max_count == -1:
        max_count = min_count

    if max_count is None:
        if len(args) < min_count:
            raise MathJsonConversionError(
                f"{head} expects at least {min_count} {_pluralize_arg(min_count)}."
            )
        return

    if min_count == max_count:
        if len(args) != min_count:
            raise MathJsonConversionError(
                f"{head} expects exactly {min_count} {_pluralize_arg(min_count)}."
            )
        return

    if len(args) < min_count or len(args) > max_count:
        raise MathJsonConversionError(
            f"{head} expects between {min_count} and {max_count} arguments."
        )


def _pluralize_arg(count: int) -> str:
    return "argument" if count == 1 else "arguments"


def _divide(left: sympy.Basic, right: sympy.Basic) -> sympy.Basic:
    return sympy.Mul(_as_expr(left), sympy.Pow(_as_expr(right), -1))


def _relation(head: str, args: tuple[sympy.Basic, ...]) -> sympy.Basic:
    relation = _RELATIONS[head]
    return sympy.And(
        *(
            _as_boolean(relation(_as_expr(left), _as_expr(right)))
            for left, right in itertools.pairwise(args)
        )
    )


def _raise_mathjson_errors(
    expr: MathJsonExpression, *, allow_trig: bool = True
) -> None:
    errors = _collect_mathjson_errors(expr, allow_trig=allow_trig)
    match errors:
        case [error]:
            raise MathJsonParseError(f"MathJSON parse error: {error}")
        case [_, _, *_]:
            raise MathJsonParseError(f"MathJSON parse errors: {'; '.join(errors)}")
        case _:
            pass


trig_commands = {
    "Arcsin",
    "Arccos",
    "Arctan",
    "Arccot",
    "Arcsec",
    "Arccsc",
    "Arsinh",
    "Arcosh",
    "Artanh",
    "Arsech",
    "Arcsch",
    "Arcoth",
    "Cosh",
    "Cos",
    "Csc",
    "Cot",
    "Csch",
    "Coth",
    "Sec",
    "Sech",
    "Sin",
    "Sinh",
    "Tan",
    "Tanh",
}


def _collect_mathjson_errors(
    expr: MathJsonExpression, *, allow_trig: bool = True
) -> list[str]:
    match expr:
        case bool() | int() | float() | str():
            return []
        case {"fn": fn}:
            return _collect_mathjson_errors(fn, allow_trig=allow_trig)
        case {}:
            return []
        case ["Error", *_]:
            return [_format_error(expr)]
        case [head, *_] if head in trig_commands and not allow_trig:
            return [f"Use of {head} is not allowed"]
        case [_, *args]:
            return [
                error
                for arg in args
                for error in _collect_mathjson_errors(arg, allow_trig=allow_trig)
            ]
        case _:
            return []


def _format_error(expr: MathJsonFunctionExpression) -> str:
    match expr:
        case ["Error", code_expr]:
            code, details = _format_error_code(code_expr)
            return ": ".join([code, *details])
        case ["Error", code_expr, detail_expr]:
            code, details = _format_error_code(code_expr)
            detail = details[0] if details else _format_error_part(detail_expr)
            return f"{code}: {detail}"
        case _:
            raise MathJsonConversionError("Expected MathJSON error expression.")


def _format_error_code(expr: MathJsonExpression) -> tuple[str, list[str]]:
    match expr:
        case ["ErrorCode", code_expr, *detail_exprs]:
            return (
                _format_error_part(code_expr),
                [_format_error_part(detail_expr) for detail_expr in detail_exprs],
            )
        case _:
            return (_format_error_part(expr), [])


def _format_error_part(expr: MathJsonExpression) -> str:
    match expr:
        case bool() | int() | float():
            return str(expr)
        case str():
            return _strip_mathjson_string_quotes(expr)
        case {}:
            match expr:
                case {"str": str(value)}:
                    return _strip_mathjson_string_quotes(value)
                case {"sym": str(value)}:
                    return _strip_mathjson_string_quotes(value)
                case {"num": str(value)}:
                    return value
                case {"fn": fn}:
                    return _format_error_part(fn)
                case _:
                    return repr(expr)
        case ("LatexString", value):
            return _format_error_part(value)
        case ("Error", *_):
            return _format_error(expr)
        case ("ErrorCode", *_):
            code, details = _format_error_code(expr)
            return ": ".join([code, *details])
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
    # MathJSON operands are broad recursive values, so sets and tuples can be
    # well-formed MathJSON but still invalid in `Add`, `Power`, `Sin`, and
    # similar SymPy expression positions. SymPy's `Expr` hierarchy is the
    # practical boundary here: it excludes containers like `FiniteSet` and
    # non-algebraic atoms like `Str`, which SymPy deprecates in `Add`/`Mul` and
    # does not handle consistently.
    if not isinstance(value, sympy.Expr):
        raise MathJsonConversionError("Expected a numeric expression.")
    return value


def _as_exprs(values: Iterable[sympy.Basic]) -> tuple[sympy.Expr, ...]:
    """Require every value to satisfy `_as_expr`."""
    return tuple(_as_expr(value) for value in values)


def _as_boolean(value: sympy.Basic) -> sympy.logic.boolalg.Boolean:
    """Require a SymPy boolean for logical operators."""
    if not isinstance(value, sympy.logic.boolalg.Boolean):
        raise MathJsonConversionError("Expected a logical expression.")
    return value


def _as_sympy_basic(value: object) -> sympy.Basic:
    """Narrow dynamic SymPy factory results back to SymPy objects."""
    # Keep SymPy's dynamic function factories behind a runtime check instead
    # of teaching Pylance that every factory call is statically precise.
    if not isinstance(value, sympy.Basic):
        raise TypeError(f"expected SymPy object, got {type(value)}")
    return value


def _symbol_name(expr: object) -> str:
    match expr:
        case str() if _matches_symbol(expr):
            return _normalize_symbol(_symbol_shorthand_value(expr))
        case {"sym": str(sym)}:
            return _normalize_symbol(sym)
        case _:
            raise MathJsonConversionError("Expected a MathJSON symbol expression.")


def _undefined_function(name: str) -> Callable[..., sympy.Basic]:
    # sympy.Function(name) returns a callable undefined function class at
    # runtime, but Pylance reports the intermediate class as the final value.
    return cast(Callable[..., sympy.Basic], sympy.Function(name))


__all__ = [
    "MathJsonParseError",
    "MathJsonStudentError",
    "mathjson_to_sympy_expr",
    "raw_mathjson_to_sympy_expr",
    "sympy_expr_to_raw_mathjson",
]
