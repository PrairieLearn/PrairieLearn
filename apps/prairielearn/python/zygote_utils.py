from typing import Any

import prairielearn as pl


def assert_all_integers_within_limits(item: Any) -> None:
    """Raise an exception if the input item contains any oversized integers."""
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
