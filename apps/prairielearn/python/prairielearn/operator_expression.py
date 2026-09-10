"""Types and helpers for working with indexed operator-expression answers.

```python
import prairielearn as pl
```
"""

from typing import Any, Literal, NotRequired, TypedDict, cast, overload

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

type OperatorExpressionValue = sympy.Expr | sympy.Set | str
"""A mathematical value or parseable string stored in an operator-expression answer."""


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


def _coerce_sympy_field(
    value: OperatorExpressionValue, field: str
) -> sympy.Expr | sympy.Set:
    if isinstance(value, str):
        try:
            value = psu.convert_string_to_sympy(
                value,
                allow_sets=True,
                allow_extra_symbols=True,
            )
        except psu.BaseSympyError as exc:
            raise ValueError(
                f'Operator-expression field "{field}" must be a valid SymPy string.'
            ) from exc
    if not isinstance(value, (sympy.Expr, sympy.Set)):
        raise TypeError(
            f'Operator-expression field "{field}" must be a SymPy expression, set, or string.'
        )
    return value


def _encode_sympy_field(value: OperatorExpressionValue, field: str) -> psu.SympyJson:
    value = _coerce_sympy_field(value, field)
    return psu.sympy_to_json(value, allow_sets=True)


@overload
def operator_expression_to_json(
    expression: OperatorExpression,
) -> OperatorExpressionJson: ...


@overload
def operator_expression_to_json(
    *,
    operator: OperatorExpressionOperator,
    limits: Literal["bounds"],
    index: sympy.Symbol | str,
    lower: OperatorExpressionValue,
    upper: OperatorExpressionValue,
    body: OperatorExpressionValue,
    operator_latex: str | None = None,
    version: Literal[1] = 1,
) -> BoundsOperatorExpressionJson: ...


@overload
def operator_expression_to_json(
    *,
    operator: OperatorExpressionOperator,
    limits: Literal["domain"],
    index: sympy.Symbol | str,
    domain: OperatorExpressionValue,
    body: OperatorExpressionValue,
    operator_latex: str | None = None,
    version: Literal[1] = 1,
) -> DomainOperatorExpressionJson: ...


@overload
def operator_expression_to_json(
    *,
    operator: OperatorExpressionOperator,
    limits: Literal["approach"],
    index: sympy.Symbol | str,
    target: OperatorExpressionValue,
    direction: OperatorExpressionDirection,
    body: OperatorExpressionValue,
    operator_latex: str | None = None,
    version: Literal[1] = 1,
) -> ApproachOperatorExpressionJson: ...


def operator_expression_to_json(
    expression: OperatorExpression | None = None,
    *,
    operator: OperatorExpressionOperator | None = None,
    limits: OperatorExpressionLimit | None = None,
    index: sympy.Symbol | str | None = None,
    body: OperatorExpressionValue | None = None,
    lower: OperatorExpressionValue | None = None,
    upper: OperatorExpressionValue | None = None,
    domain: OperatorExpressionValue | None = None,
    target: OperatorExpressionValue | None = None,
    direction: OperatorExpressionDirection | None = None,
    operator_latex: str | None = None,
    version: Literal[1] = 1,
) -> OperatorExpressionJson:
    """Encode an operator expression as a version 1 JSON answer.

    Pass a decoded ``expression`` to serialize it, or use labelled fields to set
    a structured correct answer in ``server.py``. For labelled fields, ``limits``
    selects ``lower`` and ``upper`` for ``"bounds"``, ``domain`` for ``"domain"``,
    or ``target`` and ``direction`` for ``"approach"``. Custom operators require
    ``operator_latex``; built-in operators must omit it.

    Args:
        expression: A decoded operator expression to serialize.
        operator: The operator represented by the answer.
        limits: The answer's bounds, domain, or approach layout.
        index: The bound index symbol.
        body: The operator body.
        lower: The lower bound for a bounds layout.
        upper: The upper bound for a bounds layout.
        domain: The domain for a domain layout.
        target: The approach target for an approach layout.
        direction: The approach direction for an approach layout.
        operator_latex: The required display symbol for a custom operator.
        version: The operator-expression format version.

    Returns:
        A JSON-serializable, canonical operator-expression dictionary.

    Raises:
        TypeError: If a mathematical field has the wrong SymPy type.
        ValueError: If the operator, layout, or labelled fields are inconsistent.
    """
    if expression is not None:
        if (
            operator is not None
            or limits is not None
            or index is not None
            or body is not None
            or lower is not None
            or upper is not None
            or domain is not None
            or target is not None
            or direction is not None
            or operator_latex is not None
            or version != 1
        ):
            raise TypeError(
                "Pass either an operator expression or labelled fields, not both."
            )
        match expression["limits"]:
            case "bounds":
                return operator_expression_to_json(
                    operator=expression["operator"],
                    limits="bounds",
                    index=expression["index"],
                    lower=cast(OperatorExpressionValue, expression["lower"]),
                    upper=cast(OperatorExpressionValue, expression["upper"]),
                    body=cast(OperatorExpressionValue, expression["body"]),
                    operator_latex=expression.get("operator_latex"),
                )
            case "domain":
                return operator_expression_to_json(
                    operator=expression["operator"],
                    limits="domain",
                    index=expression["index"],
                    domain=cast(OperatorExpressionValue, expression["domain"]),
                    body=cast(OperatorExpressionValue, expression["body"]),
                    operator_latex=expression.get("operator_latex"),
                )
            case "approach":
                return operator_expression_to_json(
                    operator=expression["operator"],
                    limits="approach",
                    index=expression["index"],
                    target=cast(OperatorExpressionValue, expression["target"]),
                    direction=expression["direction"],
                    body=cast(OperatorExpressionValue, expression["body"]),
                    operator_latex=expression.get("operator_latex"),
                )

    if operator is None or limits is None or index is None or body is None:
        raise TypeError(
            "Labelled operator expressions require operator, limits, index, and body."
        )
    if version != 1:
        raise ValueError(f"Unknown {version=}")
    if operator not in _OPERATORS:
        raise ValueError("Operator expression has an unsupported operator.")
    index_value = _coerce_sympy_field(index, "index")
    if not isinstance(index_value, sympy.Symbol):
        raise TypeError('Operator-expression field "index" must be a SymPy symbol.')
    if operator == "custom":
        if not isinstance(operator_latex, str) or not operator_latex.strip():
            raise ValueError(
                "Custom operator expression must have a nonempty operator_latex field."
            )
    elif operator_latex is not None:
        raise ValueError("Built-in operator expressions must not have operator_latex.")

    result: dict[str, Any] = {
        "_type": "operator_expression",
        "_version": 1,
        "operator": operator,
        "limits": limits,
        "index": psu.sympy_to_json(index_value, allow_sets=True),
        "body": _encode_sympy_field(body, "body"),
    }
    if operator_latex is not None:
        result["operator_latex"] = operator_latex

    match limits:
        case "bounds":
            if lower is None or upper is None:
                raise ValueError(
                    'Bounds operator expressions require "lower" and "upper".'
                )
            if domain is not None or target is not None or direction is not None:
                raise ValueError(
                    'Bounds operator expressions only accept "lower" and "upper".'
                )
            result["lower"] = _encode_sympy_field(lower, "lower")
            result["upper"] = _encode_sympy_field(upper, "upper")
            return cast(BoundsOperatorExpressionJson, result)
        case "domain":
            if domain is None:
                raise ValueError('Domain operator expressions require "domain".')
            if (
                lower is not None
                or upper is not None
                or target is not None
                or direction is not None
            ):
                raise ValueError('Domain operator expressions only accept "domain".')
            result["domain"] = _encode_sympy_field(domain, "domain")
            return cast(DomainOperatorExpressionJson, result)
        case "approach":
            if target is None or direction is None:
                raise ValueError(
                    'Approach operator expressions require "target" and "direction".'
                )
            if lower is not None or upper is not None or domain is not None:
                raise ValueError(
                    'Approach operator expressions only accept "target" and "direction".'
                )
            if direction not in _DIRECTIONS:
                raise ValueError("Operator expression has an unsupported direction.")
            result["target"] = _encode_sympy_field(target, "target")
            result["direction"] = direction
            return cast(ApproachOperatorExpressionJson, result)


def json_to_operator_expression(
    value: object | OperatorExpressionJson,
) -> OperatorExpression:
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
    "OperatorExpressionValue",
    "json_to_operator_expression",
    "operator_expression_to_json",
]
