from typing import Any

import prairielearn as pl


def safe_parse_int(int_str: str) -> int | float:
    """
    Parses a JSON string. If the string contains an integer that is too large,
    it will be parsed as a float instead. This ensures that we don't error out
    if the number is later re-serialized back to JSON.
    """
    equiv_int = int(int_str)
    if pl.is_int_json_serializable(equiv_int):
        return equiv_int

    return float(int_str)


def assert_all_integers_within_limits(item: Any) -> None:
    """
    Raise an exception if the input item contains any oversized integers.

    We consider an integer to be oversized if it cannot be losslessly parsed
    from JSON into a JavaScript number.
    """
    item_stack = [item]

    while item_stack:
        next_item = item_stack.pop()

        if isinstance(next_item, int):
            if not pl.is_int_json_serializable(next_item):
                raise ValueError(
                    f"Data structure contains oversized integer: {next_item}"
                )

        elif isinstance(next_item, list):
            item_stack.extend(next_item)

        elif isinstance(next_item, dict):
            item_stack.extend(next_item.keys())
            item_stack.extend(next_item.values())
