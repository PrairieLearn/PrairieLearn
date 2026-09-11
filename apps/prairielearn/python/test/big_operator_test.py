from __future__ import annotations

import copy
from typing import Any, assert_type, cast

import prairielearn as pl
import prairielearn.sympy_utils as psu
import pytest
import sympy
from prairielearn.big_operator import (
    BigApproachesOperator,
    BigApproachesOperatorJson,
    BigBoundsOperator,
    BigBoundsOperatorJson,
    BigDomainOperator,
    BigDomainOperatorJson,
)


def sympy_json(value: sympy.Basic) -> psu.SympyJson:
    return psu.sympy_to_json(cast(Any, value), allow_sets=True)


def bounds_answer(**updates: Any) -> dict[str, Any]:
    answer: dict[str, Any] = {
        "_type": "big_operator",
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


def test_decode_bounds_big_operator_and_narrow_type() -> None:
    decoded = pl.json_to_big_operator(bounds_answer())

    assert decoded["index"] == sympy.Symbol("k")
    assert decoded["body"] == sympy.Symbol("k") ** 2
    if decoded["limits"] == "bounds":
        assert_type(decoded, BigBoundsOperator)
        assert decoded["lower"] == 1
        assert decoded["upper"] == sympy.Symbol("n")


def test_decode_domain_big_operator_with_sets() -> None:
    k = sympy.Symbol("k")
    answer = {
        "_type": "big_operator",
        "_version": 1,
        "operator": "union",
        "limits": "domain",
        "index": sympy_json(k),
        "domain": sympy_json(sympy.FiniteSet(1, 2)),
        "body": sympy_json(sympy.FiniteSet(k)),
    }

    decoded = pl.json_to_big_operator(answer)

    assert_type(decoded, pl.BigOperator)
    assert decoded["limits"] == "domain"
    assert_type(decoded, BigDomainOperator)
    assert decoded["domain"] == sympy.FiniteSet(1, 2)
    assert decoded["body"] == sympy.FiniteSet(k)


def test_decode_approaches_big_operator() -> None:
    x = sympy.Symbol("x")
    answer = {
        "_type": "big_operator",
        "_version": 1,
        "operator": "limit",
        "limits": "approaches",
        "index": sympy_json(x),
        "target": sympy_json(sympy.Integer(0)),
        "direction": "from-right",
        "body": sympy_json(1 / x),
    }

    decoded = pl.json_to_big_operator(answer)

    assert decoded["limits"] == "approaches"
    assert_type(decoded, BigApproachesOperator)
    assert decoded["target"] == 0
    assert decoded["direction"] == "from-right"


def test_decode_custom_big_operator() -> None:
    k = sympy.Symbol("k", positive=True)
    f: sympy.Expr = sympy.Function("f")(k)
    answer = bounds_answer(
        operator="custom",
        index=sympy_json(k),
        body=sympy_json(f),
    )

    decoded = pl.json_to_big_operator(answer)

    assert getattr(decoded["index"], "is_positive", None) is True
    assert decoded["body"] == f


def test_encode_custom_bounds_big_operator() -> None:
    k = sympy.Symbol("k", positive=True)
    body: sympy.Expr = sympy.Function("f")(k)

    encoded = pl.big_operator_to_json(
        operator="custom",
        limits="bounds",
        index=k,
        lower=sympy.Integer(1),
        upper=sympy.Integer(4),
        body=body,
    )

    assert_type(encoded, BigBoundsOperatorJson)
    decoded = pl.json_to_big_operator(encoded)
    assert decoded["operator"] == "custom"
    assert decoded["index"] == k
    assert decoded["body"] == body


def test_big_operator_to_json_accepts_strings() -> None:
    encoded = pl.big_operator_to_json(
        operator="sum",
        limits="bounds",
        index="k",
        lower="1",
        upper="n",
        body="k ** 2",
    )

    assert_type(encoded, BigBoundsOperatorJson)
    decoded = pl.json_to_big_operator(encoded)
    assert decoded["limits"] == "bounds"
    assert decoded["index"] == sympy.Symbol("k")
    assert decoded["lower"] == 1
    assert decoded["upper"] == sympy.Symbol("n")
    assert decoded["body"] == sympy.Symbol("k") ** 2


def test_big_operator_to_json_accepts_big_operator() -> None:
    decoded = pl.json_to_big_operator(bounds_answer())

    encoded = pl.big_operator_to_json(decoded)

    assert_type(encoded, pl.BigOperatorJson)
    assert encoded == bounds_answer()


def test_encode_domain_big_operator() -> None:
    k = sympy.Symbol("k")
    encoded = pl.big_operator_to_json(
        operator="union",
        limits="domain",
        index=k,
        domain=sympy.FiniteSet(1, 2),
        body=sympy.FiniteSet(k),
    )

    assert_type(encoded, BigDomainOperatorJson)
    decoded = pl.json_to_big_operator(encoded)
    assert decoded["limits"] == "domain"
    assert decoded["domain"] == sympy.FiniteSet(1, 2)


def test_encode_approaches_big_operator() -> None:
    x = sympy.Symbol("x")
    encoded = pl.big_operator_to_json(
        operator="limit",
        limits="approaches",
        index=x,
        target=sympy.Integer(0),
        direction="from-right",
        body=1 / x,
    )

    assert_type(encoded, BigApproachesOperatorJson)
    decoded = pl.json_to_big_operator(encoded)
    assert decoded["limits"] == "approaches"
    assert decoded["direction"] == "from-right"


@pytest.mark.parametrize(
    ("kwargs", "match"),
    [
        ({"operator": "sum", "upper": None}, '"upper"'),
        ({"operator": "sum", "domain": sympy.FiniteSet(1)}, "only accept"),
    ],
)
def test_encode_rejects_inconsistent_fields(kwargs: dict[str, Any], match: str) -> None:
    with pytest.raises(ValueError, match=match):
        cast(Any, pl.big_operator_to_json)(**{
            "operator": "sum",
            "limits": "bounds",
            "index": sympy.Symbol("k"),
            "lower": sympy.Integer(1),
            "upper": sympy.Integer(2),
            "body": sympy.Symbol("k"),
            **kwargs,
        })


@pytest.mark.parametrize("value", [sympy.Symbol("i"), sympy.Symbol("j"), sympy.I])
def test_decode_preserves_symbols_named_like_imaginary_units(
    value: sympy.Basic,
) -> None:
    decoded = pl.json_to_big_operator(bounds_answer(body=sympy_json(value)))

    assert decoded["body"] == value


def test_decode_does_not_mutate_input() -> None:
    answer = bounds_answer()
    original = copy.deepcopy(answer)

    pl.json_to_big_operator(answer)

    assert answer == original


@pytest.mark.parametrize("value", [None, "", [], 1])
def test_decode_rejects_non_dictionary(value: object) -> None:
    with pytest.raises(TypeError, match="must be a dictionary"):
        pl.json_to_big_operator(value)


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
        pl.json_to_big_operator(bounds_answer(**updates))


@pytest.mark.parametrize("key", ["index", "lower", "upper", "body"])
def test_decode_rejects_missing_mathematical_field(key: str) -> None:
    answer = bounds_answer()
    answer.pop(key)

    with pytest.raises(ValueError, match="exactly the fields required"):
        pl.json_to_big_operator(answer)


def test_decode_rejects_extra_field() -> None:
    with pytest.raises(ValueError, match="exactly the fields required"):
        pl.json_to_big_operator(bounds_answer(extra="value"))


def test_decode_rejects_invalid_sympy_json() -> None:
    with pytest.raises(ValueError, match='field "body" must be'):
        pl.json_to_big_operator(bounds_answer(body={"_type": "sympy"}))


def test_decode_normalizes_invalid_sympy_expression_error() -> None:
    invalid = {
        "_type": "sympy",
        "_value": "__import__('os')",
        "_variables": [],
    }

    with pytest.raises(ValueError, match='field "body" contains invalid'):
        pl.json_to_big_operator(bounds_answer(body=invalid))


def test_decode_rejects_non_symbol_index() -> None:
    with pytest.raises(TypeError, match='field "index" must be a SymPy symbol'):
        pl.json_to_big_operator(bounds_answer(index=sympy_json(sympy.Integer(1))))


def test_decode_rejects_invalid_approaches_direction() -> None:
    x = sympy.Symbol("x")
    answer = {
        "_type": "big_operator",
        "_version": 1,
        "operator": "limit",
        "limits": "approaches",
        "index": sympy_json(x),
        "target": sympy_json(sympy.Integer(0)),
        "direction": "sideways",
        "body": sympy_json(1 / x),
    }

    with pytest.raises(ValueError, match="unsupported direction"):
        pl.json_to_big_operator(answer)


@pytest.mark.parametrize("operator", ["sum", "custom"])
def test_decode_rejects_operator_latex(operator: str) -> None:
    with pytest.raises(ValueError, match="exactly the fields required"):
        pl.json_to_big_operator(
            bounds_answer(operator=operator, operator_latex=r"\operatorname{op}")
        )
