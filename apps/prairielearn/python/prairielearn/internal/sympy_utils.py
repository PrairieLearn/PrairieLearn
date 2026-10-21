"""Shared utilities for internal SymPy expression parsing and evaluation."""

from dataclasses import dataclass

import sympy

import prairielearn.sympy_utils as psu
from prairielearn.internal import sympy_constants


@dataclass(frozen=True, slots=True)
class EvaluationContext:
    locals_for_eval: psu.LocalsForEval
    allow_complex: bool
    allow_sets: bool
    simplify_expression: bool
    allow_extra_symbols: bool
    legacy_untyped_names: frozenset[str]
    legacy_untyped_functions: frozenset[str]
    functions: psu.SympyFunctionMapT
    variables: psu.SympyMapT
    unsupported_global_names: frozenset[str]
    unsupported_global_functions: frozenset[str]

    @classmethod
    def from_locals_for_eval(
        cls,
        locals_for_eval: psu.LocalsForEval,
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
