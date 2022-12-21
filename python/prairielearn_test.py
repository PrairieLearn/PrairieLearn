# lol
import os
import sys

sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../lib"))
)

import lxml.html  # noqa: E402
import prairielearn as pl  # noqa: E402
import pytest


@pytest.mark.parametrize(
    "inner_html_string",
    [
        "test",
        "test&gt;test",
        "some loose text <pl>other <b>bold</b> text</pl>"
        "some <p> other <b>words</b> are </p> here",
        '<p>Some flavor text.</p> <pl-thing some-attribute="4">answers</pl-thing>',
    ],
)
def test_inner_html(inner_html_string: str) -> None:
    e = lxml.html.fragment_fromstring(f"<div>{inner_html_string}</div>")
    assert pl.inner_html(e) == inner_html_string
