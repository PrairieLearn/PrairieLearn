"""Set-builder representation shared by symbolic set inputs."""

from __future__ import annotations

from typing import TYPE_CHECKING, Self, cast

import sympy
from sympy.logic.boolalg import Boolean

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

    from sympy.printing.latex import LatexPrinter


class SetBuilderSet(sympy.Set):
    """An unevaluated set-builder expression with explicitly scoped variables."""

    def __new__(
        cls,
        body: sympy.Basic,
        bound_variables: Sequence[sympy.Symbol],
        condition: object,
        domains: Sequence[sympy.Set],
    ) -> Self:
        variables = tuple(bound_variables)
        domain_values = tuple(domains)
        if not variables:
            raise ValueError("A set builder must bind at least one variable.")
        if len(variables) != len(domain_values):
            raise ValueError("Each bound variable must have exactly one domain.")
        if not all(isinstance(variable, sympy.Symbol) for variable in variables):
            raise TypeError("Set-builder variables must be SymPy symbols.")
        if not all(isinstance(domain, sympy.Set) for domain in domain_values):
            raise TypeError("Set-builder domains must be SymPy sets.")

        sympy_body = sympy.sympify(body)
        sympy_condition = sympy.sympify(condition)
        if not isinstance(sympy_body, (sympy.Expr, sympy.Tuple)):
            raise TypeError("A set-builder body must be a scalar or tuple expression.")
        if not isinstance(sympy_condition, Boolean):
            raise TypeError("A set-builder condition must be Boolean.")

        return sympy.Basic.__new__(
            cls,
            sympy_body,
            sympy.Tuple(*variables),
            sympy_condition,
            sympy.Tuple(*domain_values),
        )

    @property
    def body(self) -> sympy.Expr | sympy.Tuple:
        return cast(sympy.Expr | sympy.Tuple, self.args[0])

    @property
    def bound_variables(self) -> tuple[sympy.Symbol, ...]:
        values = cast(sympy.Tuple, self.args[1]).args
        return cast(tuple[sympy.Symbol, ...], values)

    @property
    def condition(self) -> Boolean:
        return cast(Boolean, self.args[2])

    @property
    def domains(self) -> tuple[sympy.Set, ...]:
        values = cast(sympy.Tuple, self.args[3]).args
        return cast(tuple[sympy.Set, ...], values)

    @property
    def free_symbols(self) -> set[sympy.Basic]:
        symbols: set[sympy.Basic] = set().union(
            self.body.free_symbols,
            self.condition.free_symbols,
            *(domain.free_symbols for domain in self.domains),
        )
        return symbols - set(self.bound_variables)

    def _latex(self, printer: LatexPrinter) -> str:
        doprint = printer._print
        domain_latex = [
            rf"{doprint(variable)} \in {doprint(domain)}"
            for variable, domain in zip(self.bound_variables, self.domains, strict=True)
        ]
        conditions = domain_latex
        if self.condition is not sympy.true:
            conditions.append(doprint(self.condition))
        condition_latex = r" \land ".join(conditions) or r"\mathrm{True}"
        return (
            rf"\left\{{{doprint(self.body)} \mathrel{{\middle|}} "
            rf"{condition_latex}\right\}}"
        )

    def as_standard_set(self) -> sympy.Set:
        """Return an equivalent standard SymPy set when it can be represented."""
        variables = self.bound_variables
        domains = self.domains
        condition = self.condition

        if len(variables) == 1:
            variable = variables[0]
            domain: sympy.Set = domains[0]
            if condition is not sympy.true:
                domain = sympy.ConditionSet(variable, condition, domain)
            if self.body == variable:
                return domain
            return sympy.ImageSet(sympy.Lambda(variable, self.body), domain)

        variable_tuple = sympy.Tuple(*variables)
        product_domain = sympy.ProductSet(*domains)
        if self.body == variable_tuple:
            if condition is sympy.true:
                return product_domain
            return sympy.ConditionSet(variable_tuple, condition, product_domain)
        if condition is sympy.true:
            return sympy.ImageSet(sympy.Lambda(variables, self.body), *domains)
        return self

    def doit(self, **hints: object) -> sympy.Set:
        standard = self.as_standard_set()
        if standard is self:
            return self
        if hints.get("deep", True):
            return standard.doit(**hints)
        return standard


def set_builder(
    body: sympy.Basic,
    bound_variables: sympy.Symbol | Sequence[sympy.Symbol],
    condition: object = sympy.true,
    domains: sympy.Set | Sequence[sympy.Set] | None = None,
) -> SetBuilderSet:
    """Create a set-builder expression for use as an element correct answer."""
    variables = (
        (bound_variables,)
        if isinstance(bound_variables, sympy.Symbol)
        else tuple(bound_variables)
    )
    if domains is None:
        domain_values = len(variables) * (sympy.S.Reals,)
    elif isinstance(domains, sympy.Set):
        if len(variables) != 1:
            raise ValueError(
                "A single domain can only be used with one bound variable."
            )
        domain_values = (domains,)
    else:
        domain_values = tuple(domains)
    return SetBuilderSet(body, variables, condition, domain_values)


def set_builder_from_standard(value: sympy.Set) -> SetBuilderSet | None:
    """Convert a standard ConditionSet or ImageSet to a builder representation."""
    if isinstance(value, sympy.ConditionSet):
        symbol = value.sym
        if isinstance(symbol, sympy.Tuple):
            raw_variables = symbol.args
            if not all(
                isinstance(variable, sympy.Symbol) for variable in raw_variables
            ):
                return None
            variables = cast(tuple[sympy.Symbol, ...], raw_variables)
            if not isinstance(value.base_set, sympy.ProductSet):
                return None
            domains = cast(tuple[sympy.Set, ...], value.base_set.sets)
            body: sympy.Basic = symbol
        elif isinstance(symbol, sympy.Symbol):
            variables = (symbol,)
            domains = (value.base_set,)
            body = symbol
        else:
            return None
        return SetBuilderSet(body, variables, value.condition, domains)

    if isinstance(value, sympy.ImageSet):
        raw_variables = tuple(value.lamda.variables)
        if not all(isinstance(variable, sympy.Symbol) for variable in raw_variables):
            return None
        variables = cast(tuple[sympy.Symbol, ...], raw_variables)
        domains = cast(tuple[sympy.Set, ...], tuple(value.base_sets))
        if len(variables) != len(domains):
            return None
        return SetBuilderSet(value.lamda.expr, variables, sympy.true, domains)
    return None


def alpha_equivalent(left: SetBuilderSet, right: SetBuilderSet) -> bool:
    """Compare builders structurally while ignoring bound-variable names."""
    if len(left.bound_variables) != len(right.bound_variables):
        return False
    canonical = tuple(
        sympy.Dummy(f"_pl_bound_{index}") for index in range(len(left.bound_variables))
    )
    left_substitutions = dict(zip(left.bound_variables, canonical, strict=True))
    right_substitutions = dict(zip(right.bound_variables, canonical, strict=True))
    return (
        left.body.xreplace(left_substitutions)
        == right.body.xreplace(right_substitutions)
        and left.condition.xreplace(left_substitutions)
        == right.condition.xreplace(right_substitutions)
        and all(
            left_domain.xreplace(left_substitutions)
            == right_domain.xreplace(right_substitutions)
            for left_domain, right_domain in zip(
                left.domains, right.domains, strict=True
            )
        )
    )


def normalize_set_builder(value: sympy.Set) -> sympy.Set:
    """Normalize a builder to a standard set when SymPy can prove the result."""
    builder = (
        value if isinstance(value, SetBuilderSet) else set_builder_from_standard(value)
    )
    if builder is None:
        return value

    variables = builder.bound_variables
    if len(variables) != 1:
        return builder.as_standard_set()

    variable = variables[0]
    domain = builder.domains[0]
    constrained_domain = domain
    if builder.condition is not sympy.true:
        try:
            solved = sympy.solveset(builder.condition, variable, domain=domain)
        except (NotImplementedError, TypeError, ValueError):
            solved = sympy.ConditionSet(variable, builder.condition, domain)
        if isinstance(solved, sympy.Set):
            constrained_domain = solved

    if builder.body == variable:
        return constrained_domain

    if isinstance(builder.body, sympy.Expr):
        try:
            image = sympy.calculus.util.function_range(
                builder.body, variable, constrained_domain
            )
        except (NotImplementedError, TypeError, ValueError):
            image = None
        if isinstance(image, sympy.Set):
            return image
    return sympy.ImageSet(sympy.Lambda(variable, builder.body), constrained_domain)


def _deserialize_set_builder(  # pyright: ignore[reportUnusedFunction]
    body: sympy.Basic,
    variables: sympy.Tuple,
    condition: Boolean,
    domains: sympy.Tuple,
) -> SetBuilderSet:
    bound_variables = cast(tuple[sympy.Symbol, ...], variables.args)
    domain_values = cast(tuple[sympy.Set, ...], domains.args)
    return SetBuilderSet(body, bound_variables, condition, domain_values)


def _deserialize_predicate(  # pyright: ignore[reportUnusedFunction]
    name: sympy.Symbol, *arguments: sympy.Basic
) -> Boolean:
    predicate = cast("Callable[..., Boolean]", sympy.Predicate(str(name)))
    return predicate(*arguments)
