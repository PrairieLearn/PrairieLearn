"""MathJSON types and supported-subset serialization for symbolic input."""

from __future__ import annotations

import json
from typing import TypedDict

import sympy
from sympy.assumptions.assume import AppliedPredicate

from prairielearn.set_builder import SetBuilderSet, set_builder_from_standard


class MathJsonAttributes(TypedDict, total=False):
    latex: str
    sourceOffsets: tuple[int, int]


class MathJsonNumberObject(MathJsonAttributes):
    num: str


class MathJsonSymbolObject(MathJsonAttributes):
    sym: str


class MathJsonStringObject(MathJsonAttributes):
    str: str


class MathJsonFunctionObject(MathJsonAttributes):
    fn: MathJsonFunctionExpression


type MathJsonPrimitive = bool | int | float | str
type MathJsonExpressionObject = (
    MathJsonNumberObject
    | MathJsonSymbolObject
    | MathJsonStringObject
    | MathJsonFunctionObject
)
type MathJsonFunctionExpression = list[MathJsonExpression]
type MathJsonExpression = (
    MathJsonPrimitive | MathJsonExpressionObject | MathJsonFunctionExpression
)


_SYMPY_FUNCTIONS: dict[object, str] = {
    sympy.Abs: "Abs",
    sympy.acos: "Arccos",
    sympy.acosh: "Arcosh",
    sympy.asin: "Arcsin",
    sympy.asinh: "Arsinh",
    sympy.atan: "Arctan",
    sympy.atanh: "Artanh",
    sympy.cos: "Cos",
    sympy.cosh: "Cosh",
    sympy.cot: "Cot",
    sympy.csc: "Csc",
    sympy.exp: "Exp",
    sympy.factorial: "Factorial",
    sympy.log: "Log",
    sympy.Max: "Max",
    sympy.Min: "Min",
    sympy.sec: "Sec",
    sympy.sign: "Sign",
    sympy.sin: "Sin",
    sympy.sinh: "Sinh",
    sympy.sqrt: "Sqrt",
    sympy.tan: "Tan",
    sympy.tanh: "Tanh",
}


def sympy_to_mathjson(expr: sympy.Basic) -> MathJsonExpression:
    """Serialize the symbolic-input subset of SymPy to MathJSON.

    This is intentionally partial. Callers that backfill legacy submissions should
    retain the text submission when this function raises ``TypeError``.

    Raises:
        TypeError: If ``expr`` is outside the symbolic-input MathJSON subset.
    """
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
        case sympy.S.Naturals0:
            return "NonNegativeIntegers"
        case sympy.S.Integers:
            return "Integers"
        case sympy.S.Rationals:
            return "RationalNumbers"
        case sympy.S.Reals:
            return "RealNumbers"
        case sympy.S.Complexes:
            return "ComplexNumbers"
        case sympy.Integer():
            return int(expr)
        case sympy.Rational():
            return ["Rational", int(expr.p), int(expr.q)]
        case sympy.Float():
            return {"num": str(expr)}
        case sympy.Symbol():
            return expr.name
        case SetBuilderSet():
            domain_conditions: list[MathJsonExpression] = [
                ["Element", sympy_to_mathjson(variable), sympy_to_mathjson(domain)]
                for variable, domain in zip(
                    expr.bound_variables, expr.domains, strict=True
                )
            ]
            if expr.condition is not sympy.true:
                domain_conditions.append(sympy_to_mathjson(expr.condition))
            condition: MathJsonExpression
            if len(domain_conditions) == 1:
                condition = domain_conditions[0]
            else:
                condition = ["And", *domain_conditions]
            return [
                "Set",
                sympy_to_mathjson(expr.body),
                ["Condition", condition],
            ]
        case sympy.ConditionSet() | sympy.ImageSet():
            builder = set_builder_from_standard(expr)
            if builder is None:
                raise TypeError(f"unsupported SymPy object: {expr}")
            return sympy_to_mathjson(builder)
        case AppliedPredicate():
            return [
                str(expr.function).removeprefix("Q."),
                *(sympy_to_mathjson(argument) for argument in expr.arguments),
            ]
        case sympy.Contains():
            return [
                "Element",
                sympy_to_mathjson(expr.args[0]),
                sympy_to_mathjson(expr.args[1]),
            ]
        case sympy.Equality():
            return ["Equal", *(sympy_to_mathjson(arg) for arg in expr.args)]
        case sympy.Unequality():
            return ["NotEqual", *(sympy_to_mathjson(arg) for arg in expr.args)]
        case sympy.StrictLessThan():
            return ["Less", *(sympy_to_mathjson(arg) for arg in expr.args)]
        case sympy.LessThan():
            return ["LessEqual", *(sympy_to_mathjson(arg) for arg in expr.args)]
        case sympy.StrictGreaterThan():
            return ["Greater", *(sympy_to_mathjson(arg) for arg in expr.args)]
        case sympy.GreaterThan():
            return ["GreaterEqual", *(sympy_to_mathjson(arg) for arg in expr.args)]
        case sympy.And():
            return ["And", *(sympy_to_mathjson(arg) for arg in expr.args)]
        case sympy.Or():
            return ["Or", *(sympy_to_mathjson(arg) for arg in expr.args)]
        case sympy.Not():
            return ["Not", sympy_to_mathjson(expr.args[0])]
        case sympy.Xor():
            return ["Xor", *(sympy_to_mathjson(arg) for arg in expr.args)]
        case sympy.Implies():
            return ["Implies", *(sympy_to_mathjson(arg) for arg in expr.args)]
        case sympy.Equivalent():
            return ["Equivalent", *(sympy_to_mathjson(arg) for arg in expr.args)]
        case sympy.Tuple():
            return ["Tuple", *(sympy_to_mathjson(arg) for arg in expr.args)]
        case sympy.Add():
            return ["Add", *(sympy_to_mathjson(arg) for arg in expr.args)]
        case sympy.Mul():
            return ["Multiply", *(sympy_to_mathjson(arg) for arg in expr.args)]
        case sympy.Pow():
            return [
                "Power",
                sympy_to_mathjson(expr.base),
                sympy_to_mathjson(expr.exp),
            ]
        case sympy.FiniteSet():
            return ["Set", *(sympy_to_mathjson(arg) for arg in expr.args)]
        case sympy.Union():
            return ["Union", *(sympy_to_mathjson(arg) for arg in expr.args)]
        case sympy.Intersection():
            return ["Intersection", *(sympy_to_mathjson(arg) for arg in expr.args)]
        case sympy.Complement():
            return ["SetMinus", *(sympy_to_mathjson(arg) for arg in expr.args)]
        case sympy.Interval():
            start = sympy_to_mathjson(expr.start)
            end = sympy_to_mathjson(expr.end)
            return [
                "Interval",
                ["Open", start] if expr.left_open else start,
                ["Open", end] if expr.right_open else end,
            ]
        case _ if expr.func in _SYMPY_FUNCTIONS or expr.is_Function:
            arguments = [sympy_to_mathjson(arg) for arg in expr.args]
            head = _SYMPY_FUNCTIONS.get(expr.func)
            if head is not None:
                return [head, *arguments]
            return ["Apply", expr.func.__name__, *arguments]
        case _:
            raise TypeError(f"unsupported SymPy object: {expr}")


def sympy_to_raw_mathjson(expr: sympy.Basic) -> str:
    """Serialize a supported SymPy expression as JSON text containing MathJSON."""
    return json.dumps(sympy_to_mathjson(expr))
