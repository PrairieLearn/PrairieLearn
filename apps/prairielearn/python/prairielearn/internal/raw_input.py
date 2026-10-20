"""Utilities for displaying raw text submissions."""

import html
from collections.abc import Callable

from prairielearn.misc_utils import escape_unicode_string


def _escape_non_ascii_string(string: str) -> str:
    return "".join(
        character if "\x20" <= character <= "\x7e" else f"<U+{ord(character):x}>"
        for character in string
    )


def _render_value(value: str, formatter: Callable[[str], str]) -> str:
    if value == "":
        return '<span class="text-body-secondary">(empty string)</span>'

    return (
        '<pre class="mb-0" style="white-space: pre-wrap; overflow-wrap: anywhere">'
        f"{html.escape(formatter(value))}</pre>"
    )


def _render_popover_content(readable_value: str, ascii_value: str) -> str:
    return (
        '<p class="mb-1">Control and formatting characters are shown as '
        "<code>&lt;U+xxxx&gt;</code>.</p>"
        f"{readable_value}"
        '<details class="mt-2">'
        "<summary>Show all non-ASCII characters</summary>"
        '<p class="mb-1 mt-2">Characters outside U+0020 through U+007E are escaped.</p>'
        f"{ascii_value}"
        "</details>"
    )


def render_raw_input_popover_content(raw_input: str) -> str:
    """Render safe HTML describing a raw text submission."""
    return _render_popover_content(
        _render_value(raw_input, escape_unicode_string),
        _render_value(raw_input, _escape_non_ascii_string),
    )


def _render_popover_button(content: str, input_label: str) -> str:
    return (
        '<button type="button" '
        'class="ms-1 btn btn-sm btn-secondary small border" '
        'data-bs-placement="auto" data-bs-toggle="popover" data-bs-html="true" '
        'data-bs-custom-class="popover-wide popover-scrollable" '
        'data-bs-title="Original input" '
        f'aria-label="Original input for {html.escape(input_label, quote=True)}" '
        f'data-bs-content="{html.escape(content, quote=True)}">'
        '<i class="fas fa-question-circle" aria-hidden="true"></i>'
        "</button>"
    )


def render_raw_input_popover(raw_input: str, input_label: str) -> str:
    """Render a popover button describing a raw text submission."""
    return _render_popover_button(
        render_raw_input_popover_content(raw_input), input_label
    )
