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
        "./p[contains(., 'Invisible characters')]"
    )

    assert readable in content
    assert bool(control_and_formatting_messages) is ("control" in expected_sections)
    assert ("special characters" in content) is ("non_ascii" in expected_sections)
    assert not root.xpath("./details")

    if "control" in expected_sections:
        assert root.index(control_and_formatting_messages[0]) == 0

    if "non_ascii" in expected_sections:
        assert ascii_only in content


def test_render_raw_input_popover_handles_empty_strings() -> None:
    content = pl.render_raw_input_popover_content("")

    assert content.count("(nothing entered)") == 1


@pytest.mark.parametrize(
    ("ascii_only", "non_ascii"),
    [
        ("plain ASCII", "café"),
        ([["1", "2"]], [["1", "café"]]),
    ],
)
def test_render_raw_input_popover_can_hide_ascii_only_input(
    ascii_only: str | list[list[str]],
    non_ascii: str | list[list[str]],
) -> None:
    assert (
        pl.render_raw_input_popover(ascii_only, "answer", show_if_ascii_only=False)
        == ""
    )
    assert 'aria-label="Answer as entered for answer"' in pl.render_raw_input_popover(
        non_ascii, "answer", show_if_ascii_only=False
    )


def test_render_raw_input_popover_escapes_content_for_html_attribute() -> None:
    popover = pl.render_raw_input_popover(
        '<img src=x onerror="alert(1)">', 'answer "one"'
    )
    content = pl.render_raw_input_popover_content('<img src=x onerror="alert(1)">')

    assert html.escape(content, quote=True) in popover
    assert '<img src=x onerror="alert(1)">' not in popover
    assert 'aria-label="Answer as entered for answer &quot;one&quot;"' in popover


def test_render_raw_input_grid_popover_preserves_grid_shape() -> None:
    popover = html.unescape(
        pl.render_raw_input_popover([["1", "2\u200b"], ["café", ""]], "matrix answer")
    )

    assert 'aria-label="Answer as entered for matrix answer"' in popover
    assert popover.count("<tr>") == 4
    assert popover.count("<td>") == 8
    assert "2&lt;U+200b&gt;" in popover
    assert "café" in popover
    assert "caf&lt;U+e9&gt;" in popover
    assert popover.index("Invisible characters") < popover.index("<table")
    assert popover.index("</table>") < popover.index("special characters")


def test_render_raw_input_grid_popover_omits_irrelevant_guidance() -> None:
    popover = html.unescape(
        pl.render_raw_input_popover([["1", "2"], ["3", "4"]], "matrix answer")
    )

    assert popover.count("<tr>") == 2
    assert "Invisible characters" not in popover
    assert "special characters" not in popover
