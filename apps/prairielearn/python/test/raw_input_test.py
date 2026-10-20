import html

import pytest
from prairielearn.internal.raw_input import (
    render_raw_input_popover,
    render_raw_input_popover_content,
)


@pytest.mark.parametrize(
    ("raw_input", "readable", "ascii_only"),
    [
        ("plain ASCII", "plain ASCII", "plain ASCII"),
        ("a\u200bb", "a&lt;U+200b&gt;b", "a&lt;U+200b&gt;b"),
        ("café", "café", "caf&lt;U+e9&gt;"),
        ("e\u0301", "é", "e&lt;U+301&gt;"),
        (chr(0x1F642), chr(0x1F642), "&lt;U+1f642&gt;"),
        (
            "\t\n\x7f",
            "&lt;U+9&gt;&lt;U+a&gt;&lt;U+7f&gt;",
            "&lt;U+9&gt;&lt;U+a&gt;&lt;U+7f&gt;",
        ),
        ("<script>&", "&lt;script&gt;&amp;", "&lt;script&gt;&amp;"),
    ],
)
def test_render_raw_input_popover_content(
    raw_input: str, readable: str, ascii_only: str
) -> None:
    content = render_raw_input_popover_content(raw_input)

    assert readable in content
    assert ascii_only in content
    assert "Show all non-ASCII characters" in content


def test_render_raw_input_popover_handles_empty_strings() -> None:
    content = render_raw_input_popover_content("")

    assert content.count("(empty string)") == 2


def test_render_raw_input_popover_escapes_content_for_html_attribute() -> None:
    popover = render_raw_input_popover('<img src=x onerror="alert(1)">', 'answer "one"')
    content = render_raw_input_popover_content('<img src=x onerror="alert(1)">')

    assert html.escape(content, quote=True) in popover
    assert '<img src=x onerror="alert(1)">' not in popover
    assert 'aria-label="Original input for answer &quot;one&quot;"' in popover
