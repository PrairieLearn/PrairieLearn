from typing import Any

import pytest
import zygote_utils as zu


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
    except Exception as err:
        assert False, err


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
    with pytest.raises(ValueError):
        zu.assert_all_integers_within_limits(item)
