import json
from typing import Any

import prairielearn.internal.zygote_utils as zu
import pytest


@pytest.mark.parametrize(
    "item", ["-9007199254740991", "-1", "0", "1", "9007199254740991"]
)
def test_safe_parse_int_small_ints(item: str) -> None:
    loaded_item = json.loads(item, parse_int=zu.safe_parse_int)
    assert isinstance(loaded_item, int)
    assert int(item) == loaded_item


@pytest.mark.parametrize(
    "item",
    [
        "-2.8e16",
        "28000000000000000",
        "-9007199254740992",
        "9007199254740992",
        "2.8e16",
    ],
)
def test_safe_parse_int_large_ints(item: str) -> None:
    loaded_item = json.loads(item, parse_int=zu.safe_parse_int)
    assert isinstance(loaded_item, float)
    assert float(item) == loaded_item


@pytest.mark.parametrize(
    "item",
    [
        1,
        [1, 2, [3, 4, {"thing": 5}]],
        [1, 2, "999999999999999999999"],
        [{"stuff": 999999}, {"other stuff": "key"}],
    ],
)
def test_all_integers_within_limits_no_exception(item: Any) -> None:
    # We are checking that no exception is thrown
    zu.assert_all_integers_within_limits(item)


@pytest.mark.parametrize(
    "item",
    [
        999999999999999999999,
        [1, 2, [1, 2, {999999999999999999999: "4"}]],
        [1, 2, [1, 2, {"4": [999999999999999999999]}]],
        ["9999999", 2, 8, 99999999999999999],
    ],
)
def test_all_integers_within_limits_raise_exception(item: Any) -> None:
    with pytest.raises(ValueError, match="oversized integer"):
        zu.assert_all_integers_within_limits(item)


def test_get_module_function_not_present() -> None:
    mod = {"a": 1, "b": 2}
    fcn = zu.get_module_function(mod, "test")
    assert fcn is None


def test_get_module_function_not_callable() -> None:
    mod = {"test": 123}
    fcn = zu.get_module_function(mod, "test")
    assert fcn is None


def test_get_module_function_success() -> None:
    def test_function() -> str:
        return "hello"

    test_function.__module__ = None  # type: ignore[misc]
    mod = {"test": test_function}
    fcn = zu.get_module_function(mod, "test")
    assert fcn is test_function
