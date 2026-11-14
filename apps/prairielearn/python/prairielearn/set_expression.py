"""Set-only policy wrapper around the shared symbolic expression grammar."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING, Never, cast

import sympy

import prairielearn.sympy_utils as psu

if TYPE_CHECKING:
    from collections.abc import Iterable, Sequence


NAMED_SETS = {
    "R": sympy.S.Reals,
    "Q": sympy.S.Rationals,
    "Z": sympy.S.Integers,
    "N": sympy.S.Naturals,
    "C": sympy.S.Complexes,
}
NAMED_SET_NAMES = frozenset(NAMED_SETS)
_SET_OPERATOR_NAMES = frozenset({"U", "cup", "cap"})


class SetSyntax(Enum):
    TUPLE = "tuple"
    INTERVAL = "interval"


@dataclass(frozen=True, slots=True)
class SetParseSuccess:
    expr: sympy.Set
    json: psu.SympyJson


@dataclass(frozen=True, slots=True)
class SetParseFailure:
    error: str


type SetParseResult = SetParseSuccess | SetParseFailure


def validate_names(variables: Iterable[str], custom_functions: Iterable[str]) -> None:
    """Reject instructor names that shadow the unqualified named-set syntax."""
    variable_names = set(variables)
    function_names = set(custom_functions)
    conflicting_named_variables = sorted(NAMED_SET_NAMES.intersection(variable_names))
    conflicting_named_functions = sorted(NAMED_SET_NAMES.intersection(function_names))
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
    conflicting_operators = sorted(
        _SET_OPERATOR_NAMES.intersection(variable_names | function_names)
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

    def raise_error() -> Never:
        raise error

    result = psu._try_parse_as_sympy(
        submission,
        raise_error,
        allow_complex=allow_complex,
    )
    assert isinstance(result, psu.SympyParseFailure)
    return result.error


def try_parse_set_submission(
    submission: str | None,
    variables: Iterable[str] | None,
    *,
    formula_editor: bool = False,
    formula_editor_latex: str | None = None,
    allow_complex: bool = False,
    allow_trig_functions: bool = True,
    custom_functions: Sequence[str] = (),
    simplify_expression: bool = True,
    assumptions: psu.AssumptionsDictT | None = None,
    syntax: SetSyntax = SetSyntax.TUPLE,
) -> SetParseResult:
    """Normalize, parse, evaluate, and serialize a set-only submission."""
    if submission is None or not submission.strip():
        return SetParseFailure("No submitted answer.")

    variable_list = list(variables or ())
    custom_function_list = list(custom_functions)
    try:
        validate_names(variable_list, custom_function_list)
    except ValueError as exc:
        return SetParseFailure(str(exc))

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

    try:
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
    return SetParseSuccess(set_value, result_json)
