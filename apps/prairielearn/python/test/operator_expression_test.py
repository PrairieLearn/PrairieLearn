from __future__ import annotations

import copy
from typing import Any, assert_type, cast

import prairielearn as pl
import prairielearn.sympy_utils as psu
import pytest
import sympy
from prairielearn.operator_expression import (
    ApproachOperatorExpression,
    BoundsOperatorExpression,
    DomainOperatorExpression,
)


def sympy_json(value: sympy.Basic) -> psu.SympyJson:
    return psu.sympy_to_json(cast(Any, value), allow_sets=True)


def bounds_answer(**updates: Any) -> dict[str, Any]:
    answer: dict[str, Any] = {
        "_type": "operator_expression",
        "_version": 1,
        "operator": "sum",
        "limits": "bounds",
        "index": sympy_json(sympy.Symbol("k")),
        "lower": sympy_json(sympy.Integer(1)),
        "upper": sympy_json(sympy.Symbol("n")),
        "body": sympy_json(sympy.Symbol("k") ** 2),
    }
    answer.update(updates)
    return answer


def test_decode_bounds_operator_expression_and_narrow_type() -> None:
    decoded = pl.decode_operator_expression(bounds_answer())

    assert decoded["index"] == sympy.Symbol("k")
    assert decoded["body"] == sympy.Symbol("k") ** 2
    if decoded["limits"] == "bounds":
        assert_type(decoded, BoundsOperatorExpression)
        assert decoded["lower"] == 1
        assert decoded["upper"] == sympy.Symbol("n")


def test_decode_domain_operator_expression_with_sets() -> None:
    k = sympy.Symbol("k")
    answer = {
        "_type": "operator_expression",
        "_version": 1,
        "operator": "union",
        "limits": "domain",
        "index": sympy_json(k),
        "domain": sympy_json(sympy.FiniteSet(1, 2)),
        "body": sympy_json(sympy.FiniteSet(k)),
    }

    decoded = pl.decode_operator_expression(answer)

    assert_type(decoded, pl.OperatorExpression)
    assert decoded["limits"] == "domain"
    assert_type(decoded, DomainOperatorExpression)
    assert decoded["domain"] == sympy.FiniteSet(1, 2)
    assert decoded["body"] == sympy.FiniteSet(k)


def test_decode_approach_operator_expression() -> None:
    x = sympy.Symbol("x")
    answer = {
        "_type": "operator_expression",
        "_version": 1,
        "operator": "limit",
        "limits": "approach",
        "index": sympy_json(x),
        "target": sympy_json(sympy.Integer(0)),
        "direction": "from-right",
        "body": sympy_json(1 / x),
    }

    decoded = pl.decode_operator_expression(answer)

    assert decoded["limits"] == "approach"
    assert_type(decoded, ApproachOperatorExpression)
    assert decoded["target"] == 0
    assert decoded["direction"] == "from-right"


def test_decode_custom_operator_expression() -> None:
    k = sympy.Symbol("k", positive=True)
    f: sympy.Expr = sympy.Function("f")(k)  # type: ignore
    answer = bounds_answer(
        operator="custom",
        operator_latex=r"\mathbb{E}",
        index=sympy_json(k),
        body=sympy_json(f),
    )

    decoded = pl.decode_operator_expression(answer)

    assert "operator_latex" in decoded
    assert decoded["operator_latex"] == r"\mathbb{E}"
    assert getattr(decoded["index"], "is_positive", None) is True
    assert decoded["body"] == f


@pytest.mark.parametrize("value", [sympy.Symbol("i"), sympy.Symbol("j"), sympy.I])
def test_decode_preserves_symbols_named_like_imaginary_units(
    value: sympy.Basic,
) -> None:
    decoded = pl.decode_operator_expression(bounds_answer(body=sympy_json(value)))

    assert decoded["body"] == value


def test_decode_does_not_mutate_input() -> None:
    answer = bounds_answer()
    original = copy.deepcopy(answer)

    pl.decode_operator_expression(answer)

    assert answer == original


@pytest.mark.parametrize("value", [None, "", [], 1])
def test_decode_rejects_non_dictionary(value: object) -> None:
    with pytest.raises(TypeError, match="must be a dictionary"):
        pl.decode_operator_expression(value)


@pytest.mark.parametrize(
    ("updates", "match"),
    [
        ({"_type": "sympy"}, "_type"),
        ({"_version": 2}, "_version"),
        ({"operator": "mean"}, "unsupported operator"),
        ({"limits": "range"}, "unsupported limits"),
    ],
)
def test_decode_rejects_invalid_metadata(updates: dict[str, Any], match: str) -> None:
    with pytest.raises(ValueError, match=match):
        pl.decode_operator_expression(bounds_answer(**updates))


@pytest.mark.parametrize("key", ["index", "lower", "upper", "body"])
def test_decode_rejects_missing_mathematical_field(key: str) -> None:
    answer = bounds_answer()
    answer.pop(key)

    with pytest.raises(ValueError, match="exactly the fields required"):
        pl.decode_operator_expression(answer)


def test_decode_rejects_extra_field() -> None:
    with pytest.raises(ValueError, match="exactly the fields required"):
        pl.decode_operator_expression(bounds_answer(extra="value"))


def test_decode_rejects_invalid_sympy_json() -> None:
    with pytest.raises(ValueError, match='field "body" must be'):
        pl.decode_operator_expression(bounds_answer(body={"_type": "sympy"}))


def test_decode_normalizes_invalid_sympy_expression_error() -> None:
    invalid = {
        "_type": "sympy",
        "_value": "__import__('os')",
        "_variables": [],
    }

    with pytest.raises(ValueError, match='field "body" contains invalid'):
        pl.decode_operator_expression(bounds_answer(body=invalid))


def test_decode_rejects_non_symbol_index() -> None:
    with pytest.raises(TypeError, match='field "index" must be a SymPy symbol'):
        pl.decode_operator_expression(bounds_answer(index=sympy_json(sympy.Integer(1))))


def test_decode_rejects_invalid_approach_direction() -> None:
    x = sympy.Symbol("x")
    answer = {
        "_type": "operator_expression",
        "_version": 1,
        "operator": "limit",
        "limits": "approach",
        "index": sympy_json(x),
        "target": sympy_json(sympy.Integer(0)),
        "direction": "sideways",
        "body": sympy_json(1 / x),
    }

    with pytest.raises(ValueError, match="unsupported direction"):
        pl.decode_operator_expression(answer)


@pytest.mark.parametrize("operator_latex", [None, ""])
def test_decode_requires_custom_operator_latex(operator_latex: str | None) -> None:
    answer = bounds_answer(operator="custom")
    if operator_latex is not None:
        answer["operator_latex"] = operator_latex

    with pytest.raises(ValueError, match="operator_latex"):
        pl.decode_operator_expression(answer)


def test_decode_rejects_operator_latex_for_builtin_operator() -> None:
    with pytest.raises(ValueError, match="exactly the fields required"):
        pl.decode_operator_expression(bounds_answer(operator_latex=r"\sum"))
