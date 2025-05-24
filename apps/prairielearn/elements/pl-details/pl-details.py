from typing import Any

import chevron
import lxml.html
import prairielearn as pl

SHOW_CONTENT_DEFAULT = True


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["title"]
    optional_attribs = ["show"]
    pl.check_attribs(element, required_attribs, optional_attribs)


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)

    show = pl.get_boolean_attrib(element, "show", SHOW_CONTENT_DEFAULT)
    title = pl.get_string_attrib(element, "title")

    content = pl.inner_html(element)

    html_params: dict[str, Any] = {
        "uuid": pl.get_uuid(),
        "title": title,
        "content": content,
        "show": show,
    }

    with open("pl-details.mustache", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()
