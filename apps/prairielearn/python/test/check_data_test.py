from typing import Any

import pytest
from prairielearn.internal.check_data import check_data


def test_check_data_extra_props() -> None:
    with pytest.raises(ValueError, match="data contains extra keys: bad_key"):
        check_data(
            {"panel": "question"}, {"panel": "question", "bad_key": {}}, "render"
        )


def test_check_data_missing_props() -> None:
    with pytest.raises(ValueError, match="data is missing keys: panel"):
        check_data({"panel": "question"}, {}, "render")


@pytest.mark.parametrize(
    ("prop", "invalid_value", "expected_type"),
    [
        ("score", "1", "number"),
        ("score", {"blabla": 1}, "number"),
        ("variant_seed", 1.5, "integer"),
        ("variant_seed", "1", "integer"),
        ("panel", 1, "string"),
        ("panel", {"value": "question"}, "string"),
        ("editable", "true", "boolean"),
        ("editable", 1, "boolean"),
        ("params", "not an object", "object"),
        ("params", True, "object"),
        ("params", None, "object"),
    ],
)
def test_check_data_invalid_type(
    prop: str, invalid_value: Any, expected_type: str
) -> None:
    if invalid_value is None:
        with pytest.raises(ValueError, match=f'data\\["{prop}"\\] is missing'):
            check_data({}, {prop: invalid_value}, "render")
        return
    with pytest.raises(
        ValueError,
        match=f'Expected data\\["{prop}"\\] to be .* {expected_type}',
    ):
        check_data({}, {prop: invalid_value}, "render")


def test_check_data_invalid_modification() -> None:
    with pytest.raises(
        ValueError, match=r'data\["panel"\] has been illegally modified'
    ):
        check_data({"panel": "question"}, {"panel": "submission"}, "render")


def test_check_data_invalid_modification_nested() -> None:
    with pytest.raises(
        ValueError, match=r'data\["params"\] has been illegally modified'
    ):
        check_data({"params": {"foo": "bar"}}, {"params": {"foo": "baz"}}, "test")


def test_check_data_number_keys() -> None:
    with pytest.raises(ValueError, match="data contains extra keys: 1, 2"):
        check_data(
            {"panel": "question"},
            {"panel": "question", 1: "data", 2: "more data"},
            "render",
        )
