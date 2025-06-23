"""Utilities for working with HTML elements. Used for reading attributes and sanitizing HTML.

```python
from prairielearn import ...
```
"""

import html
import re
from enum import Enum
from typing import Any, TypeVar, overload

import lxml.html

from prairielearn.colors import PLColor
from prairielearn.misc_utils import escape_unicode_string

EnumT = TypeVar("EnumT", bound=Enum)

# From https://gitlab.gnome.org/GNOME/libxml2/-/blob/4aa08c80b711ab296f6e6ecab24df8cf6d0be5fc/HTMLtree.c#L305-309
LIBXML_BOOLEAN_ATTRIBUTES = frozenset({
    "checked",
    "compact",
    "declare",
    "defer",
    "disabled",
    "ismap",
    "multiple",
    "nohref",
    "noresize",
    "noshade",
    "nowrap",
    "readonly",
    "selected",
})


def get_enum_attrib(
    element: lxml.html.HtmlElement,
    name: str,
    enum_type: type[EnumT],
    default: EnumT | None = None,
) -> EnumT:
    """
    Return the named attribute for the element parsed as an enum,
    or the (optional) default value. If the default value is not provided
    and the attribute is missing then an exception is thrown. An exception
    is also thrown if the value for the enum provided is invalid.
    Also, alter the enum names to comply with PL naming convention automatically
    (replacing underscores with dashes and uppercasing). If a default value is
    provided, it must be a member of the given enum.

    Returns:
        The value of attribute `name`, as part of the enum.

    Raises:
        ValueError: If the attribute is not a valid enum value.
    """
    enum_val, is_default = (
        _get_attrib(element, name)
        if default is None
        else _get_attrib(element, name, default)
    )

    # Default doesn't need to be converted, already a value of the enum
    if is_default:
        return enum_val

    if enum_val != enum_val.lower():
        raise ValueError(
            f'Value "{enum_val}" assigned to "{name}" cannot have uppercase characters.'
        )

    upper_enum_str = enum_val.upper()
    accepted_names = {member.name.replace("_", "-") for member in enum_type}

    if upper_enum_str not in accepted_names:
        raise ValueError(
            f"{enum_val} is not a valid type, must be one of: {', '.join(member.name.lower().replace('_', '-') for member in enum_type)}."
        )

    return enum_type[upper_enum_str.replace("-", "_")]


def _compat_array(arr: list[str]) -> list[str]:
    new_arr = []
    for i in arr:
        new_arr.extend((i, i.replace("-", "_")))
    return new_arr


def check_attribs(
    element: lxml.html.HtmlElement,
    required_attribs: list[str],
    optional_attribs: list[str],
) -> None:
    """Verify that the element has all required attributes and no unknown attributes."""
    for name in required_attribs:
        if not has_attrib(element, name):
            raise ValueError(f'Required attribute "{name}" missing')
    extra_attribs = list(
        set(element.attrib)
        - set(_compat_array(required_attribs))
        - set(_compat_array(optional_attribs))
    )
    for name in extra_attribs:
        raise ValueError(f'Unknown attribute "{name}"')


def _get_attrib(
    element: lxml.html.HtmlElement, name: str, *args: Any
) -> tuple[Any, bool]:
    """Get the attribute of an HTML element.

    The default value is optional. If no
    default value is provided and the attribute is missing then an
    exception is thrown. The second return value indicates whether the
    default value was returned.

    Returns:
        The named attribute for the element, or the default value if the attribute is missing.

    Raises:
        ValueError: If the function is called with too many arguments.

    Internal function, do not all. Use one of the typed variants
    instead (e.g., `get_string_attrib()`).
    """
    # It seems like we could use keyword arguments with a default
    # value to handle the "default" argument, but we want to be able
    # to distinguish between default=None and no default being passed,
    # which means we need to explicitly handle the optional argument
    if len(args) > 1:
        raise ValueError("Only one additional argument is allowed")

    # libxml2 omits the content of certain boolean attributes during
    # serialization, so their value is not reliable. To avoid problems, we raise
    # an error if the value is used for anything other than a boolean check. The
    # boolean function has a test before this point with an early return, so
    # this point should only be reached if this is being handled with a
    # non-boolean value.
    if name.lower() in LIBXML_BOOLEAN_ATTRIBUTES:
        raise ValueError(
            f"The attribute '{name}' is an HTML boolean attribute, and should not be used."
        )

    if name in element.attrib:
        return (element.attrib[name], False)

    # We need to check for the legacy _ version
    old_name = name.replace("-", "_")
    if old_name in element.attrib:
        return (element.attrib[old_name], False)

    # Provide a default if we can
    if len(args) == 1:
        return (args[0], True)

    raise ValueError(f'Attribute "{name}" missing and no default is available')


def has_attrib(element: lxml.html.HtmlElement, name: str) -> bool:
    """If an HTML element has an attribute `name` set.

    Returns:
        `True` if the element has an attribute of that name, `False` otherwise.
    """
    old_name = name.replace("-", "_")
    return name in element.attrib or old_name in element.attrib


# Order here matters, as we want to override the case where the args is omitted
@overload
def get_string_attrib(element: lxml.html.HtmlElement, name: str) -> str: ...


@overload
def get_string_attrib(element: lxml.html.HtmlElement, name: str, *args: str) -> str: ...


@overload
def get_string_attrib(
    element: lxml.html.HtmlElement, name: str, *args: None
) -> str | None: ...


def get_string_attrib(
    element: lxml.html.HtmlElement, name: str, *args: str | None
) -> str | None:
    """
    Return the named attribute for the element, or the (optional)
    default value. If the default value is not provided and the
    attribute is missing then an exception is thrown.

    Returns:
        The string value of attribute `name`.
    """
    str_val, _ = _get_attrib(element, name, *args)
    return str_val


# Order here matters, as we want to override the case where the args is omitted
@overload
def get_boolean_attrib(element: lxml.html.HtmlElement, name: str) -> bool: ...


@overload
def get_boolean_attrib(
    element: lxml.html.HtmlElement, name: str, *args: bool
) -> bool: ...


@overload
def get_boolean_attrib(
    element: lxml.html.HtmlElement, name: str, *args: None
) -> bool | None: ...


def get_boolean_attrib(
    element: lxml.html.HtmlElement, name: str, *args: bool | None
) -> bool | None:
    """
    Return the named attribute for the element, or the (optional)
    default value. If the default value is not provided and the
    attribute is missing then an exception is thrown. If the attribute
    is not a valid boolean then an exception is thrown.

    Returns:
        The boolean value of attribute `name`.

    Raises:
        ValueError: If the attribute is not a valid boolean value.
    """
    # If the attribute is a boolean attribute, then its value is determined by its presence
    if name.lower() in LIBXML_BOOLEAN_ATTRIBUTES:
        default_value = None if len(args) == 0 else args[0]
        if default_value:
            raise ValueError(
                f'Attribute "{name}" is an HTML boolean attribute, and cannot be used with a default value of {default_value}.'
            )
        return has_attrib(element, name) or default_value

    (val, is_default) = _get_attrib(element, name, *args)
    if is_default:
        return val

    true_values = ["true", "t", "1", "True", "T", "TRUE", "yes", "y", "Yes", "Y", "YES"]
    false_values = [
        "false",
        "f",
        "0",
        "False",
        "F",
        "FALSE",
        "no",
        "n",
        "No",
        "N",
        "NO",
    ]

    if val in true_values:
        return True
    elif val in false_values:
        return False
    else:
        raise ValueError(f'Attribute "{name}" must be a boolean value: {val}')


# Order here matters, as we want to override the case where the args is omitted
@overload
def get_integer_attrib(element: lxml.html.HtmlElement, name: str) -> int: ...


@overload
def get_integer_attrib(
    element: lxml.html.HtmlElement, name: str, *args: int
) -> int: ...


@overload
def get_integer_attrib(
    element: lxml.html.HtmlElement, name: str, *args: None
) -> int | None: ...


def get_integer_attrib(
    element: lxml.html.HtmlElement, name: str, *args: int | None
) -> int | None:
    """
    Return the named attribute for the element, or the (optional)
    default value. If the default value is not provided and the
    attribute is missing then an exception is thrown. If the attribute
    is not a valid integer then an exception is thrown.

    Returns:
        The int value of attribute `name`.

    Raises:
        ValueError: If the attribute is not a valid integer value.
    """
    (val, is_default) = _get_attrib(element, name, *args)
    if is_default:
        return val
    try:
        int_val = int(val)
    except ValueError:
        int_val = None
    if int_val is None:
        # can't raise this exception directly in the above except
        # handler because it gives an overly complex displayed error
        raise ValueError(f'Attribute "{name}" must be an integer: {val}')
    return int_val


@overload
def get_float_attrib(element: lxml.html.HtmlElement, name: str) -> float: ...


@overload
def get_float_attrib(
    element: lxml.html.HtmlElement, name: str, *args: float
) -> float: ...


@overload
def get_float_attrib(
    element: lxml.html.HtmlElement, name: str, *args: None
) -> float | None: ...


def get_float_attrib(
    element: lxml.html.HtmlElement, name: str, *args: float | None
) -> float | None:
    """
    Return the named attribute for the element, or the (optional)
    default value. If the default value is not provided and the
    attribute is missing then an exception is thrown. If the attribute
    is not a valid floating-point number then an exception is thrown.

    Returns:
        The float value of attribute `name`.

    Raises:
        ValueError: If the attribute is not a valid floating-point number.

    Examples:
        >>> get_float_attrib(element, "stroke-width", 4.0)
        10.0
    """
    (val, is_default) = _get_attrib(element, name, *args)
    if is_default:
        return val
    try:
        float_val = float(val)
    except ValueError:
        float_val = None
    if float_val is None:
        # can't raise this exception directly in the above except
        # handler because it gives an overly complex displayed error
        raise ValueError(f'Attribute "{name}" must be a number: {val}')
    return float_val


@overload
def get_color_attrib(element: lxml.html.HtmlElement, name: str, *args: str) -> str: ...


@overload
def get_color_attrib(
    element: lxml.html.HtmlElement, name: str, *args: None
) -> str | None: ...


def get_color_attrib(
    element: lxml.html.HtmlElement, name: str, *args: str | None
) -> str | None:
    """
    Return a 3-digit or 6-digit hex RGB string in CSS format (e.g., '#123'
    or '#1a2b3c'), or the (optional) default value. If the default value is
    not provided and the attribute is missing then an exception is thrown. If
    the attribute is not a valid RGB string then it will be checked against various
    named colors.  If the attribute is still not valid an exception is thrown.

    Returns:
        A CSS color string.

    Raises:
        ValueError: If the attribute is not a valid CSS color string.
    """
    (val, is_default) = _get_attrib(element, name, *args)
    if is_default:
        # Allow for `None` default
        if val is None:
            return val

        if PLColor.match(val) is not None:
            return PLColor(val).to_string(hex=True)
        else:
            return val

    match = re.search(r"^#(?:[0-9a-fA-F]{1,2}){3}$", val)
    if match:
        return val
    elif PLColor.match(val) is not None:
        return PLColor(val).to_string(hex=True)
    else:
        raise ValueError(f'Attribute "{name}" must be a CSS-style RGB string: {val}')


def inner_html(element: lxml.html.HtmlElement) -> str:
    """Get the inner HTML of an lxml element.

    Returns:
        The inner HTML of the element as a string.
    """
    inner = element.text
    if inner is None:
        inner = ""
    inner = html.escape(str(inner))
    for child in element:
        inner += lxml.html.tostring(child, method="html").decode("utf-8")
    return inner


def escape_invalid_string(string: str) -> str:
    """Wrap and escape string in `<code>` tags.

    Returns:
        The sanitized user input wrapped in a code block.
    """
    return f'<code class="user-output-invalid">{html.escape(escape_unicode_string(string))}</code>'
