"""Constants shared by SymPy parsing and evaluation."""

from __future__ import annotations

import operator
from types import MappingProxyType as FrozenDict
from typing import TYPE_CHECKING, Any, Final

import sympy

if TYPE_CHECKING:
    from collections.abc import Callable

    from sympy.parsing.sympy_parser import DICT

standard_operators: Final = ("( )", "+", "-", "*", "/", "^", "**", "!")
set_notation_operators: Final = (
    "U",
    "&",
    "{ }",
    "[ , ]",
    "( , ]",
    "[ , )",
    "( , )",
)

set_domain_names: Final = frozenset({
    "Complexes",
    "Integers",
    "Naturals",
    "Naturals0",
    "Rationals",
    "Reals",
})
set_domains: Final[frozenset[sympy.Set]] = frozenset(
    getattr(sympy.S, name) for name in set_domain_names
)

helpers: Final[FrozenDict[str, Callable[..., Any]]] = FrozenDict({
    "Number": sympy.Number,
    "_Integer": sympy.Integer,
})

variables: Final[FrozenDict[str, sympy.Basic | complex]] = FrozenDict({
    "pi": sympy.pi,
    "e": sympy.E,
    "infty": sympy.oo,
})

hidden_variables: Final[FrozenDict[str, sympy.Basic | complex]] = FrozenDict({
    "_Exp1": sympy.E,
})

complex_variables: Final[FrozenDict[str, sympy.Basic | complex]] = FrozenDict({
    "i": sympy.I,
    "j": sympy.I,
})

hidden_complex_variables: Final[FrozenDict[str, sympy.Basic | complex]] = FrozenDict({
    "_ImaginaryUnit": sympy.I,
})

functions: Final[FrozenDict[str, Callable[..., Any]]] = FrozenDict({
    "exp": sympy.exp,
    "log": sympy.log,
    "ln": sympy.log,
    "sqrt": sympy.sqrt,
    "factorial": sympy.factorial,
    "abs": sympy.Abs,
    "sgn": sympy.sign,
    "max": sympy.Max,
    "min": sympy.Min,
    # Extra aliases needed for parsing SymPy's serialized expressions.
    "sign": sympy.sign,
    "Abs": sympy.Abs,
    "Max": sympy.Max,
    "Min": sympy.Min,
})

trig_functions: Final[FrozenDict[str, Callable[..., Any]]] = FrozenDict({
    "cos": sympy.cos,
    "sin": sympy.sin,
    "tan": sympy.tan,
    "sec": sympy.sec,
    "cot": sympy.cot,
    "csc": sympy.csc,
    "cosh": sympy.cosh,
    "sinh": sympy.sinh,
    "tanh": sympy.tanh,
    "arccos": sympy.acos,
    "arcsin": sympy.asin,
    "arctan": sympy.atan,
    "acos": sympy.acos,
    "asin": sympy.asin,
    "atan": sympy.atan,
    "arctan2": sympy.atan2,
    "atan2": sympy.atan2,
    "atanh": sympy.atanh,
    "acosh": sympy.acosh,
    "asinh": sympy.asinh,
})

set_functions: Final[FrozenDict[str, Callable[..., Any]]] = FrozenDict({
    "Complement": sympy.Complement,
    "Interval": sympy.Interval,
    "FiniteSet": sympy.FiniteSet,
    "Union": sympy.Union,
    "Intersection": sympy.Intersection,
})

set_operator_desugars: Final[FrozenDict[str, str]] = FrozenDict({
    "U": "|",
    "cup": "|",
    "∪": "|",  # ruff:ignore[ambiguous-unicode-character-string]
    "cap": "&",
    "∩": "&",
})
set_operators: Final[FrozenDict[str, Callable[..., Any]]] = FrozenDict({
    name: operator.or_ if desugared == "|" else operator.and_
    for name, desugared in set_operator_desugars.items()
})
union_operators: Final = frozenset(
    name for name, desugared in set_operator_desugars.items() if desugared == "|"
) | frozenset({"|"})
intersection_operators: Final = frozenset(
    name for name, desugared in set_operator_desugars.items() if desugared == "&"
) | frozenset({"&"})
set_operator_names: Final = union_operators | intersection_operators

# Unicode operators that the formula editor or common pastes produce. They must
# be mapped before unidecode, which would otherwise turn them into "[?]"
# (misreported as set notation), drop them, or change their meaning (e.g. the
# multiplication sign becomes the letter "x").
unicode_operators: Final[FrozenDict[str, str]] = FrozenDict({
    "·": "*",  # middle dot
    "×": "*",  # ruff:ignore[ambiguous-unicode-character-string]
    "•": "*",  # bullet
    "∗": "*",  # ruff:ignore[ambiguous-unicode-character-string]
    "∙": "*",  # bullet operator
    "⋅": "*",  # dot operator
    "\u2062": "*",  # invisible times
    "—": "-",  # em dash
    "―": "-",  # horizontal bar
    "∕": "/",  # ruff:ignore[ambiguous-unicode-character-string]
    "∣": "|",  # ruff:ignore[ambiguous-unicode-character-string]
    "\u2061": "",  # function application
})

# Operators that give two values; unidecode would turn "±" into "+-".
plus_minus_operators: Final = frozenset({"±", "∓"})

# Variables that were honored in the old parsing scheme.
legacy_global_variables: Final[FrozenDict[str, sympy.Basic | complex]] = FrozenDict({
    "Catalan": sympy.Catalan,
    "EmptySet": sympy.EmptySet,
    "E": sympy.E,
    "EulerGamma": sympy.EulerGamma,
    "GoldenRatio": sympy.GoldenRatio,
    "I": sympy.I,
    "TribonacciConstant": sympy.TribonacciConstant,
    "UniversalSet": sympy.UniversalSet,
    "false": sympy.false,
    "nan": sympy.nan,
    "oo": sympy.oo,
    "true": sympy.true,
    "zoo": sympy.zoo,
})


def _load_sympy_globals() -> FrozenDict[str, Any]:
    # Based on code here:
    # https://github.com/sympy/sympy/blob/26f7bdbe3f860e7b4492e102edec2d6b429b5aaf/sympy/parsing/sympy_parser.py#L1086
    sympy_globals: DICT = {}
    exec("from sympy import *", sympy_globals)
    return FrozenDict(sympy_globals)


sympy_globals: Final = _load_sympy_globals()
sympy_global_names: Final = frozenset(sympy_globals)
sympy_global_functions: Final = frozenset(
    name for name, value in sympy_globals.items() if callable(value)
)

# `sqrt` is a plain function whose second parameter is `evaluate`, so it has no
# `nargs` and would silently accept a second argument.
builtin_function_arity_overrides: Final[FrozenDict[str, tuple[int, ...]]] = FrozenDict({
    "sqrt": (1,)
})

# Complement was accepted as a custom function before it became a set builtin.
legacy_custom_function_overrides: Final = frozenset({"Complement"})

evaluate_false_functions: Final = frozenset(trig_functions) | frozenset({
    "Abs",
    "abs",
    "exp",
    "ln",
    "log",
    "sgn",
    "sign",
    "sqrt",
})

# From https://gist.github.com/beniwohli/765262, with a typo fix for lambda/Lambda
greek_alphabet: Final = FrozenDict({
    0x0391: "Alpha",
    0x0392: "Beta",
    0x0393: "Gamma",
    0x0394: "Delta",
    0x0395: "Epsilon",
    0x0396: "Zeta",
    0x0397: "Eta",
    0x0398: "Theta",
    0x0399: "Iota",
    0x039A: "Kappa",
    0x039B: "Lambda",
    0x039C: "Mu",
    0x039D: "Nu",
    0x039E: "Xi",
    0x039F: "Omicron",
    0x03A0: "Pi",
    0x03A1: "Rho",
    0x03A3: "Sigma",
    0x03A4: "Tau",
    0x03A5: "Upsilon",
    0x03A6: "Phi",
    0x03A7: "Chi",
    0x03A8: "Psi",
    0x03A9: "Omega",
    0x03B1: "alpha",
    0x03B2: "beta",
    0x03B3: "gamma",
    0x03B4: "delta",
    0x03B5: "epsilon",
    0x03B6: "zeta",
    0x03B7: "eta",
    0x03B8: "theta",
    0x03B9: "iota",
    0x03BA: "kappa",
    0x03BB: "lambda",
    0x03BC: "mu",
    0x03BD: "nu",
    0x03BE: "xi",
    0x03BF: "omicron",
    0x03C0: "pi",
    0x03C1: "rho",
    0x03C3: "sigma",
    0x03C4: "tau",
    0x03C5: "upsilon",
    0x03C6: "phi",
    0x03C7: "chi",
    0x03C8: "psi",
    0x03C9: "omega",
})
