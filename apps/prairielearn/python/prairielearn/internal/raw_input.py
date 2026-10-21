"""Utilities for displaying raw text submissions."""

from collections.abc import Callable, Sequence
from pathlib import Path

import chevron

from prairielearn.misc_utils import escape_unicode_string

_TEMPLATE_DIRECTORY = Path(__file__).parent


def _render_template(template_name: str, data: dict[str, object]) -> str:
    with (_TEMPLATE_DIRECTORY / template_name).open() as template:
        return chevron.render(template, data, partials_path=_TEMPLATE_DIRECTORY).strip()


def _escape_non_ascii_string(string: str) -> str:
    return "".join(
        character if "\x20" <= character <= "\x7e" else f"<U+{ord(character):x}>"
        for character in string
    )


def _value_context(value: str, formatter: Callable[[str], str]) -> dict[str, object]:
    return {
        "empty": value == "",
        "value": formatter(value),
    }


def _render_popover_content(
    readable: dict[str, object],
    ascii_only: dict[str, object],
    raw_values: Sequence[str],
) -> str:
    return _render_template(
        "raw_input_popover_content.mustache",
        {
            "readable": readable,
            "ascii_only": ascii_only,
            "show_control_and_formatting_message": any(
                escape_unicode_string(value) != value for value in raw_values
            ),
            "show_ascii_only": any(
                _escape_non_ascii_string(value) != escape_unicode_string(value)
                for value in raw_values
            ),
        },
    )


def render_raw_input_popover_content(raw_input: str) -> str:
    """Render safe HTML describing a raw text submission."""
    return _render_popover_content(
        _value_context(raw_input, escape_unicode_string),
        _value_context(raw_input, _escape_non_ascii_string),
        (raw_input,),
    )


def _render_popover_button(content: str, input_label: str) -> str:
    return _render_template(
        "raw_input_popover.mustache",
        {"content": content, "title": f"Answer as entered for {input_label}"},
    )


def render_raw_input_popover(raw_input: str, input_label: str) -> str:
    """Render a popover button describing a raw text submission."""
    return _render_popover_button(
        render_raw_input_popover_content(raw_input), input_label
    )
