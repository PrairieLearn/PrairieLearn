from typing import Any

import prairielearn as pl


def safe_parse_int(int_str: str) -> int | float:
    """
    Parse a JSON string. If the string contains an integer that is too large,
    parse as a float instead. This ensures that we don't error out
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

    Raises:
        ValueError: If any oversized integers are found in the input item.
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


def get_module_function(mod: dict[str, Any], fcn: str) -> Any:
    if fcn not in mod:
        return None

    if not callable(mod[fcn]):
        return None

    # Special case: some people like to put `from sympy import *` in their Python
    # files. This make's SymPy's `test` function available in the module namespace,
    # which interferes with our usage of a `test(...)` function to test questions.
    #
    # Here, we check whether the `test` function in the module actually comes from the
    # module itself, which we can detect by checking whether its `__module__` attribute
    # is set to `None`. If it is not, we return `None` to indicate that there is no
    # valid `test` function in the module.
    #
    # We're deliberately only doing this check for the `test` function. It would make
    # sense to do it for others too, but we're not aware of issues with other function
    # names, and we want to minimize the risk of breaking existing code.
    if (
        fcn == "test"
        and hasattr(mod[fcn], "__module__")
        and mod[fcn].__module__ is not None
    ):
        return None

    return mod[fcn]
