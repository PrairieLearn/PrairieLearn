import html

import lxml.html
import prairielearn as pl
import pytest


@pytest.mark.parametrize(
    (
        "raw_input",
        "readable",
        "ascii_only",
        "expected_sections",
    ),
    [
        ("plain ASCII", "plain ASCII", "plain ASCII", ()),
        ("a\u200bb", "a&lt;U+200b&gt;b", "a&lt;U+200b&gt;b", ("control",)),
        ("café", "café", "caf&lt;U+e9&gt;", ("non_ascii",)),
        (
            "a\u200bcafé<script>&",
            "a&lt;U+200b&gt;café&lt;script&gt;&amp;",
            "a&lt;U+200b&gt;caf&lt;U+e9&gt;&lt;script&gt;&amp;",
            ("control", "non_ascii"),
        ),
    ],
)
def test_render_raw_input_popover_content(
    raw_input: str,
    readable: str,
    ascii_only: str,
    expected_sections: tuple[str, ...],
) -> None:
    content = pl.render_raw_input_popover_content(raw_input)
    root = lxml.html.fragment_fromstring(content, create_parent="div")
    control_and_formatting_messages = root.xpath(
        "./p/em[contains(., 'Control and formatting characters')]"
    )

    assert readable in content
    assert bool(control_and_formatting_messages) is ("control" in expected_sections)
    assert ("Show all non-ASCII characters" in content) is (
        "non_ascii" in expected_sections
    )

    if "control" in expected_sections:
        assert root.index(control_and_formatting_messages[0].getparent()) == 1

    if "non_ascii" in expected_sections:
        assert ascii_only in content


def test_render_raw_input_popover_handles_empty_strings() -> None:
    content = pl.render_raw_input_popover_content("")

    assert content.count("(empty string)") == 1


def test_render_raw_input_popover_escapes_content_for_html_attribute() -> None:
    popover = pl.render_raw_input_popover(
        '<img src=x onerror="alert(1)">', 'answer "one"'
    )
    content = pl.render_raw_input_popover_content('<img src=x onerror="alert(1)">')

    assert html.escape(content, quote=True) in popover
    assert '<img src=x onerror="alert(1)">' not in popover
    assert 'aria-label="Original input for answer &quot;one&quot;"' in popover
