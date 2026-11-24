"""Set-only policy wrapper around the shared symbolic expression grammar."""

from __future__ import annotations

from contextlib import suppress
from dataclasses import dataclass
from enum import Enum
from itertools import pairwise
from typing import TYPE_CHECKING, Any, cast

import sympy

import prairielearn.sympy_utils as psu
from prairielearn.internal import mathjson as internal_mathjson
from prairielearn.set_builder import SetBuilderSet, set_builder_from_standard

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Sequence


NAMED_SETS = {
    "RR": sympy.S.Reals,
    "QQ": sympy.S.Rationals,
    "ZZ": sympy.S.Integers,
    "NN": sympy.S.Naturals0,
    "CC": sympy.S.Complexes,
}
NAMED_SET_NAMES = frozenset(NAMED_SETS)
_SET_OPERATOR_NAMES = frozenset({"U", "cup", "cap"})


def _pairwise_relation(
    relation: object, *values: sympy.Basic
) -> sympy.logic.boolalg.Boolean:
    if len(values) < 2:
        raise TypeError("A comparison requires at least two values.")
    callable_relation = cast(
        "Callable[[sympy.Basic, sympy.Basic], sympy.logic.boolalg.Boolean | bool]",
        relation,
    )
    return sympy.And(
        *(callable_relation(left, right) for left, right in pairwise(values))
    )


_SET_BUILDER_FUNCTIONS: dict[str, Callable[..., Any]] = {
    "And": sympy.And,
    "Element": sympy.Contains,
    "Equal": lambda *values: _pairwise_relation(sympy.Eq, *values),
    "Equivalent": sympy.Equivalent,
    "Greater": lambda *values: _pairwise_relation(sympy.Gt, *values),
    "GreaterEqual": lambda *values: _pairwise_relation(sympy.Ge, *values),
    "Implies": sympy.Implies,
    "Less": lambda *values: _pairwise_relation(sympy.Lt, *values),
    "LessEqual": lambda *values: _pairwise_relation(sympy.Le, *values),
    "Not": sympy.Not,
    "NotElement": lambda value, domain: sympy.Not(sympy.Contains(value, domain)),
    "NotEqual": lambda *values: sympy.Not(_pairwise_relation(sympy.Eq, *values)),
    "Or": sympy.Or,
    "Xor": sympy.Xor,
}


def _predicate_function(name: str) -> Callable[..., Any]:
    return cast("Callable[..., Any]", sympy.Predicate(name))


class SetSyntax(Enum):
    TUPLE = "tuple"
    INTERVAL = "interval"


@dataclass(frozen=True, slots=True)
class SetParseSuccess:
    expr: sympy.Set
    json: psu.SympyJson
    mathjson: str | None = None


@dataclass(frozen=True, slots=True)
class SetParseFailure:
    error: str


type SetParseResult = SetParseSuccess | SetParseFailure


def validate_names(
    variables: Iterable[str],
    custom_functions: Iterable[str],
    custom_predicates: Iterable[str] = (),
) -> None:
    """Reject instructor names that shadow the unqualified named-set syntax."""
    variable_names = set(variables)
    function_names = set(custom_functions)
    predicate_names = set(custom_predicates)
    conflicting_named_variables = sorted(NAMED_SET_NAMES.intersection(variable_names))
    conflicting_named_functions = sorted(NAMED_SET_NAMES.intersection(function_names))
    conflicting_named_predicates = sorted(NAMED_SET_NAMES.intersection(predicate_names))
    if conflicting_named_variables:
        raise ValueError(
            "Named sets cannot be used as variable names: "
            + ", ".join(conflicting_named_variables)
        )
    if conflicting_named_functions:
        raise ValueError(
            "Named sets cannot be used as custom function names: "
            + ", ".join(conflicting_named_functions)
        )
    if conflicting_named_predicates:
        raise ValueError(
            "Named sets cannot be used as custom predicate names: "
            + ", ".join(conflicting_named_predicates)
        )
    conflicting_configured_names = sorted(
        (variable_names & predicate_names) | (function_names & predicate_names)
    )
    if conflicting_configured_names:
        raise ValueError(
            "Custom predicate names cannot also be variables or custom functions: "
            + ", ".join(conflicting_configured_names)
        )
    conflicting_operators = sorted(
        _SET_OPERATOR_NAMES.intersection(
            variable_names | function_names | predicate_names
        )
    )
    if conflicting_operators:
        raise ValueError(
            "Set operators cannot be used as variable or custom function names: "
            + ", ".join(conflicting_operators)
        )


def is_representable_set(
    value: sympy.Basic, *, syntax: SetSyntax = SetSyntax.TUPLE
) -> bool:
    """Return whether the set can round-trip through the set-only grammar."""
    if value in NAMED_SETS.values() or value is sympy.S.EmptySet:
        return True
    if isinstance(value, SetBuilderSet):
        if isinstance(value.body, sympy.Tuple) and syntax is not SetSyntax.TUPLE:
            return False
        return all(
            is_representable_set(domain, syntax=syntax) for domain in value.domains
        )
    if isinstance(value, (sympy.ConditionSet, sympy.ImageSet)):
        builder = set_builder_from_standard(value)
        return builder is not None and is_representable_set(builder, syntax=syntax)
    if isinstance(value, sympy.Interval):
        return syntax is SetSyntax.INTERVAL
    if isinstance(value, sympy.FiniteSet):
        for item in value.args:
            if isinstance(item, sympy.Set):
                if not is_representable_set(item, syntax=syntax):
                    return False
            elif isinstance(item, sympy.Tuple):
                if syntax is not SetSyntax.TUPLE or len(item) < 2:
                    return False
                if not all(isinstance(coordinate, sympy.Expr) for coordinate in item):
                    return False
        return True
    if isinstance(value, (sympy.Union, sympy.Intersection, sympy.Complement)):
        return all(
            isinstance(item, sympy.Set) and is_representable_set(item, syntax=syntax)
            for item in value.args
        )
    return False


def _format_parse_error(
    submission: str, error: psu.BaseSympyError, *, allow_complex: bool
) -> str:
    if isinstance(error, psu._HasSetExpressionError):
        return error.message
    if isinstance(error, psu.HasParseError):
        return (
            "Your answer has a syntax error near "
            f"<code>{psu.point_to_error(submission, error.offset)}</code>."
        )

    return psu._parse_failure_from_exception(
        submission, error, allow_complex=allow_complex
    ).error


def try_parse_set_submission(
    submission: str | None,
    variables: Iterable[str] | None,
    *,
    formula_editor: bool = False,
    formula_editor_latex: str | None = None,
    formula_editor_mathjson: str | None = None,
    allow_complex: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: Sequence[str] = (),
    custom_predicates: Sequence[str] = (),
    simplify_expression: bool = True,
    assumptions: psu.AssumptionsDictT | None = None,
    syntax: SetSyntax = SetSyntax.TUPLE,
) -> SetParseResult:
    """Normalize, parse, evaluate, and serialize a set-only submission."""
    if submission is None or not submission.strip():
        return SetParseFailure("No submitted answer.")

    variable_list = list(variables or ())
    custom_function_list = list(custom_functions)
    custom_predicate_list = list(custom_predicates)
    try:
        validate_names(variable_list, custom_function_list, custom_predicate_list)
    except ValueError as exc:
        return SetParseFailure(str(exc))

    use_mathjson = bool(
        formula_editor and formula_editor_mathjson and formula_editor_mathjson.strip()
    )

    try:
        if use_mathjson:
            assert formula_editor_mathjson is not None
            parsed = psu._try_parse_mathjson_as_sympy(
                formula_editor_mathjson,
                formula_editor_latex or submission,
                variable_list,
                allow_hidden=True,
                allow_complex=allow_complex,
                allow_sets=True,
                allow_trig_functions=allow_trig_functions,
                custom_functions=custom_function_list,
                simplify_expression=simplify_expression,
                assumptions=assumptions,
                additional_variables=NAMED_SETS,
                additional_functions=_SET_BUILDER_FUNCTIONS
                | {name: _predicate_function(name) for name in custom_predicate_list},
                parser_start="set_start",
                simplify_set_operations=False,
                allow_set_functions=False,
                delimited_syntax=syntax.value,
            )
            if isinstance(parsed, psu.SympyParseFailure):
                return SetParseFailure(parsed.error)
            value = parsed.expr
        else:
            normalized = psu._try_normalize_symbolic_input(
                submission,
                variable_list,
                custom_function_list,
                formula_editor=formula_editor,
                latex=formula_editor_latex,
                allow_trig_functions=allow_trig_functions,
                allow_complex=allow_complex,
                allow_sets=True,
            )
            if isinstance(normalized, psu.SympyParseFailure):
                return SetParseFailure(normalized.error)
            value, _structure = psu._convert_source_to_sympy_with_source(
                normalized,
                submission,
                variable_list,
                allow_hidden=True,
                allow_complex=allow_complex,
                allow_sets=True,
                allow_trig_functions=allow_trig_functions,
                custom_functions=custom_function_list,
                simplify_expression=simplify_expression,
                assumptions=assumptions,
                additional_variables=NAMED_SETS,
                parser_start="set_start",
                simplify_set_operations=False,
                allow_set_functions=False,
                delimited_syntax=syntax.value,
            )
        value = cast(sympy.Basic, value)
        if not isinstance(value, sympy.Set):
            return SetParseFailure("Your answer must be a set.")
        if not is_representable_set(value, syntax=syntax):
            return SetParseFailure(
                "Your answer produces a set that this input cannot represent."
            )
        set_value = value
        result_json = psu.sympy_to_json(
            set_value, allow_complex=allow_complex, allow_sets=True
        )
        psu.json_to_sympy(
            result_json,
            allow_complex=allow_complex,
            allow_sets=True,
            simplify_expression=simplify_expression,
        )
    except psu.BaseSympyError as exc:
        return SetParseFailure(
            _format_parse_error(submission, exc, allow_complex=allow_complex)
        )
    except (TypeError, ValueError):
        return SetParseFailure("Your answer contains an invalid set expression.")
    serialized_mathjson = formula_editor_mathjson if use_mathjson else None
    if formula_editor and serialized_mathjson is None:
        with suppress(TypeError):
            serialized_mathjson = internal_mathjson.sympy_to_raw_mathjson(set_value)
    return SetParseSuccess(set_value, result_json, serialized_mathjson)
