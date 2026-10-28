"""Internal types and diagnostics for SymPy expression evaluation."""

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from enum import Enum
from typing import Any, TypedDict, cast

import sympy

from prairielearn.internal import sympy_constants, sympy_source

type SympyMap = dict[str, sympy.Basic | complex]
type SympyFunctionMap = dict[str, Callable[..., Any]]


class LocalsForEvaluation(TypedDict):
    functions: SympyFunctionMap
    variables: SympyMap
    helpers: SympyFunctionMap


type SympyValue = sympy.Expr | sympy.Set


class SympyType(Enum):
    SCALAR = "number"
    SET = "set"
    BOOL = "true/false"
    STRING = "text"

    def __str__(self) -> str:
        """Return the user-facing name for the value type."""
        return self.value


@dataclass(frozen=True, slots=True)
class ParseDiagnostic:
    offset: int


@dataclass(frozen=True, slots=True)
class InvalidExpressionDiagnostic:
    offset: int


@dataclass(frozen=True, slots=True)
class InvalidFunctionDiagnostic:
    offset: int
    text: str


@dataclass(frozen=True, slots=True)
class FunctionWithoutArgumentsDiagnostic:
    offset: int
    text: str


@dataclass(frozen=True, slots=True)
class InvalidSymbolDiagnostic:
    symbol: str
    offset: int | None = None


@dataclass(frozen=True, slots=True)
class SetNotationDiagnostic:
    pass


@dataclass(frozen=True, slots=True)
class ArgumentTypeDiagnostic:
    function: str
    got: SympyType
    allowable_types: tuple[SympyType, ...]
    argument_index: int
    offset: int = -1


@dataclass(frozen=True, slots=True)
class FunctionArityDiagnostic:
    function: str
    provided: int
    expected: str
    offset: int = -1


@dataclass(frozen=True, slots=True)
class EvaluationFailureDiagnostic:
    pass


type EvaluationDiagnostic = (
    ParseDiagnostic
    | InvalidExpressionDiagnostic
    | InvalidFunctionDiagnostic
    | FunctionWithoutArgumentsDiagnostic
    | InvalidSymbolDiagnostic
    | SetNotationDiagnostic
    | ArgumentTypeDiagnostic
    | FunctionArityDiagnostic
    | EvaluationFailureDiagnostic
)


@dataclass(frozen=True, slots=True)
class ExpressionEvaluationError(Exception):
    diagnostic: EvaluationDiagnostic
    source: sympy_source.SourceText
    span: sympy_source.SourceSpan | None = None
    cause: BaseException | None = None


def format_comma_separated(
    items: Iterable[object], last_conjunction: str = "or"
) -> str:
    comma_separated = ", ".join(map(str, items))
    return f" {last_conjunction} ".join(comma_separated.rsplit(", ", maxsplit=1))


def builtin_function_arities(name: str) -> tuple[int, ...] | None:
    if name in sympy_constants.builtin_function_arity_overrides:
        return sympy_constants.builtin_function_arity_overrides[name]
    function = sympy_constants.functions.get(
        name
    ) or sympy_constants.trig_functions.get(name)
    nargs = getattr(function, "nargs", None)
    if isinstance(nargs, sympy.FiniteSet):
        return tuple(sorted(int(cast(sympy.Integer, arity)) for arity in nargs))
    return None


@dataclass(frozen=True, slots=True)
class EvaluationContext:
    locals_for_eval: LocalsForEvaluation
    allow_complex: bool
    allow_sets: bool
    simplify_expression: bool
    allow_extra_symbols: bool
    legacy_untyped_names: frozenset[str]
    legacy_untyped_functions: frozenset[str]
    functions: SympyFunctionMap
    variables: SympyMap
    unsupported_global_names: frozenset[str]
    unsupported_global_functions: frozenset[str]

    @classmethod
    def from_locals_for_eval(
        cls,
        locals_for_eval: LocalsForEvaluation,
        *,
        allow_complex: bool,
        allow_sets: bool,
        simplify_expression: bool,
        allow_extra_symbols: bool,
        legacy_untyped_names: frozenset[str] = frozenset(),
        legacy_untyped_functions: frozenset[str] = frozenset(),
    ) -> "EvaluationContext":
        functions = locals_for_eval["functions"] | locals_for_eval["helpers"]
        variables = (
            sympy_constants.legacy_global_variables | locals_for_eval["variables"]
        )
        for name in sympy_constants.set_domain_names:
            if allow_extra_symbols and not allow_sets:
                variables.setdefault(name, sympy.Symbol(name))
            else:
                variables.setdefault(name, getattr(sympy.S, name))
        configured_names = functions.keys() | variables.keys()
        return cls(
            locals_for_eval=locals_for_eval,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            simplify_expression=simplify_expression,
            allow_extra_symbols=allow_extra_symbols,
            legacy_untyped_names=legacy_untyped_names,
            legacy_untyped_functions=legacy_untyped_functions,
            functions=functions,
            variables=variables,
            unsupported_global_names=sympy_constants.sympy_global_names
            - configured_names,
            unsupported_global_functions=sympy_constants.sympy_global_functions
            - configured_names,
        )
