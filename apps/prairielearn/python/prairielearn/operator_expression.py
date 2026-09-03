"""Types and helpers for working with indexed operator-expression answers.

```python
import prairielearn as pl
```
"""

from typing import Any, Literal, NotRequired, TypedDict, cast

import sympy

import prairielearn.sympy_utils as psu

type OperatorExpressionOperator = Literal[
    "sum",
    "product",
    "integral",
    "limit",
    "union",
    "intersection",
    "disjoint-union",
    "min",
    "max",
    "custom",
]
"""An operator supported by an operator-expression answer."""

type OperatorExpressionLimit = Literal["bounds", "domain", "approach"]
"""The layout of an operator-expression answer's limits."""

type OperatorExpressionDirection = Literal["two-sided", "from-left", "from-right"]
"""The direction of an approach operator-expression answer."""


class _OperatorExpressionJsonBase(TypedDict):
    _type: Literal["operator_expression"]
    _version: Literal[1]
    operator: OperatorExpressionOperator
    index: psu.SympyJson
    body: psu.SympyJson
    operator_latex: NotRequired[str]


class BoundsOperatorExpressionJson(_OperatorExpressionJsonBase):
    """JSON representation of an operator expression with lower and upper bounds."""

    limits: Literal["bounds"]
    lower: psu.SympyJson
    upper: psu.SympyJson


class DomainOperatorExpressionJson(_OperatorExpressionJsonBase):
    """JSON representation of an operator expression over a domain."""

    limits: Literal["domain"]
    domain: psu.SympyJson


class ApproachOperatorExpressionJson(_OperatorExpressionJsonBase):
    """JSON representation of an operator expression approaching a target."""

    limits: Literal["approach"]
    target: psu.SympyJson
    direction: OperatorExpressionDirection


type OperatorExpressionJson = (
    BoundsOperatorExpressionJson
    | DomainOperatorExpressionJson
    | ApproachOperatorExpressionJson
)
"""The persisted JSON representation of an operator-expression answer."""


class _OperatorExpressionBase(TypedDict):
    _type: Literal["operator_expression"]
    _version: Literal[1]
    operator: OperatorExpressionOperator
    index: sympy.Symbol
    body: sympy.Basic
    operator_latex: NotRequired[str]


class BoundsOperatorExpression(_OperatorExpressionBase):
    """A decoded operator expression with lower and upper bounds."""

    limits: Literal["bounds"]
    lower: sympy.Basic
    upper: sympy.Basic


class DomainOperatorExpression(_OperatorExpressionBase):
    """A decoded operator expression over a domain."""

    limits: Literal["domain"]
    domain: sympy.Basic


class ApproachOperatorExpression(_OperatorExpressionBase):
    """A decoded operator expression approaching a target."""

    limits: Literal["approach"]
    target: sympy.Basic
    direction: OperatorExpressionDirection


type OperatorExpression = (
    BoundsOperatorExpression | DomainOperatorExpression | ApproachOperatorExpression
)
"""A decoded operator-expression answer whose mathematical fields are SymPy values."""


_OPERATORS: frozenset[str] = frozenset({
    "sum",
    "product",
    "integral",
    "limit",
    "union",
    "intersection",
    "disjoint-union",
    "min",
    "max",
    "custom",
})
_DIRECTIONS: frozenset[str] = frozenset({
    "two-sided",
    "from-left",
    "from-right",
})


def _decode_sympy_field(value: Any, field: str) -> sympy.Basic:
    if not psu.is_sympy_json(value) or not all(
        isinstance(name, str) for name in value.get("_variables", [])
    ):
        raise ValueError(
            f'Operator-expression field "{field}" must be PrairieLearn SymPy JSON.'
        )
    allow_complex = not any(name in {"i", "j"} for name in value["_variables"])
    try:
        decoded = psu.json_to_sympy(
            value,
            allow_sets=True,
            allow_complex=allow_complex,
        )
    except (TypeError, ValueError, psu.BaseSympyError) as exc:
        raise ValueError(
            f'Operator-expression field "{field}" contains invalid SymPy JSON.'
        ) from exc
    if not isinstance(decoded, sympy.Basic):
        raise TypeError(
            f'Operator-expression field "{field}" must decode to a SymPy value.'
        )
    return decoded


def decode_operator_expression(value: object) -> OperatorExpression:
    """Validate and decode a version 1 operator-expression answer.

    Mathematical fields in the returned dictionary are SymPy values. The
    ``limits`` field discriminates between bounds, domain, and approach answers,
    so type checkers can narrow the result before layout-specific fields are read.

    Args:
        value: A value from ``data["correct_answers"]`` or
            ``data["submitted_answers"]`` after element processing.

    Returns:
        A decoded bounds, domain, or approach operator expression.

    Raises:
        TypeError: If ``value`` is not a dictionary.
        ValueError: If ``value`` is not a valid version 1 operator expression.
    """
    if not isinstance(value, dict):
        raise TypeError("Operator expression must be a dictionary.")
    if value.get("_type") != "operator_expression":
        raise ValueError('Operator expression must have _type "operator_expression".')
    if value.get("_version") != 1:
        raise ValueError("Operator expression must have _version 1.")

    operator = value.get("operator")
    if not isinstance(operator, str) or operator not in _OPERATORS:
        raise ValueError("Operator expression has an unsupported operator.")
    operator = cast(OperatorExpressionOperator, operator)
    limits = value.get("limits")
    if limits not in {"bounds", "domain", "approach"}:
        raise ValueError("Operator expression has an unsupported limits form.")
    limits = cast(OperatorExpressionLimit, limits)

    expected_keys = {"_type", "_version", "operator", "limits", "index", "body"}
    match limits:
        case "bounds":
            expected_keys.update(("lower", "upper"))
        case "domain":
            expected_keys.add("domain")
        case "approach":
            expected_keys.update(("target", "direction"))

    operator_latex = value.get("operator_latex")
    if operator == "custom" and (
        not isinstance(operator_latex, str) or not operator_latex.strip()
    ):
        raise ValueError(
            "Custom operator expression must have a nonempty operator_latex field."
        )
    if operator == "custom":
        expected_keys.add("operator_latex")
    if set(value) != expected_keys:
        raise ValueError(
            "Operator expression does not contain exactly the fields required "
            f"for operator={operator!r} and limits={limits!r}."
        )

    index = _decode_sympy_field(value.get("index"), "index")
    if not isinstance(index, sympy.Symbol):
        raise TypeError('Operator-expression field "index" must be a SymPy symbol.')
    body = _decode_sympy_field(value.get("body"), "body")
    common: dict[str, Any] = {
        "_type": "operator_expression",
        "_version": 1,
        "operator": operator,
        "limits": limits,
        "index": index,
        "body": body,
    }
    if operator_latex is not None:
        common["operator_latex"] = operator_latex

    match limits:
        case "bounds":
            common["lower"] = _decode_sympy_field(value.get("lower"), "lower")
            common["upper"] = _decode_sympy_field(value.get("upper"), "upper")
            return cast(BoundsOperatorExpression, common)
        case "domain":
            common["domain"] = _decode_sympy_field(value.get("domain"), "domain")
            return cast(DomainOperatorExpression, common)
        case "approach":
            direction = value.get("direction")
            if not isinstance(direction, str) or direction not in _DIRECTIONS:
                raise ValueError("Operator expression has an unsupported direction.")
            common["target"] = _decode_sympy_field(value.get("target"), "target")
            common["direction"] = cast(OperatorExpressionDirection, direction)
            return cast(ApproachOperatorExpression, common)


__all__ = [
    "ApproachOperatorExpression",
    "ApproachOperatorExpressionJson",
    "BoundsOperatorExpression",
    "BoundsOperatorExpressionJson",
    "DomainOperatorExpression",
    "DomainOperatorExpressionJson",
    "OperatorExpression",
    "OperatorExpressionDirection",
    "OperatorExpressionJson",
    "OperatorExpressionLimit",
    "OperatorExpressionOperator",
    "decode_operator_expression",
]
