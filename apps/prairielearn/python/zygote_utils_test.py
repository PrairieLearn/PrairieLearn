import json
from typing import Any

import orjson
import pytest
import zygote_utils as zu


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
        "28000000000000000",
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
    try:
        zu.assert_all_integers_within_limits(item)
        orjson.dumps(item, option=orjson.OPT_NON_STR_KEYS | orjson.OPT_STRICT_INTEGER)
    except Exception as err:
        assert False, err


@pytest.mark.parametrize(
    "item",
    [
        999999999999999999999,
        # TODO: This fails to serialize in `orjson`, but it is passes our
        # `is_int_json_serializable` check.
        # 9007199254740991,
        9007199254740992,
        [1, 2, [1, 2, {999999999999999999999: "4"}]],
        [1, 2, [1, 2, {"4": [999999999999999999999]}]],
        ["9999999", 2, 8, 999999999999999999999],
        {"1": {"2": {"3": 999999999999999999999}}},
    ],
)
def test_all_integers_within_limits_raise_exception(item: Any) -> None:
    with pytest.raises(ValueError):
        zu.assert_all_integers_within_limits(item)

    with pytest.raises(TypeError):
        orjson.dumps(item, option=orjson.OPT_NON_STR_KEYS | orjson.OPT_STRICT_INTEGER)
