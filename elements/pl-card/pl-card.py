from typing import Any

import chevron
import lxml.html
import prairielearn as pl

HEADER_DEFAULT = ""
TITLE_DEFAULT = ""
SUBTITLE_DEFAULT = ""
FOOTER_DEFAULT = ""
IMG_TOP_SRC_DEFAULT = ""
IMG_TOP_ALT_DEFAULT = ""
IMG_BOTTOM_SRC_DEFAULT = ""
IMG_BOTTOM_ALT_DEFAULT = ""
WIDTH_DEFAULT = "auto"


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = [
        "header",
        "title",
        "subtitle",
        "footer",
        "img-top-src",
        "img-top-alt",
        "img-bottom-src",
        "img-bottom-alt",
        "width",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)

    header = pl.get_string_attrib(element, "header", HEADER_DEFAULT)
    title = pl.get_string_attrib(element, "title", TITLE_DEFAULT)
    subtitle = pl.get_string_attrib(element, "subtitle", SUBTITLE_DEFAULT)
    footer = pl.get_string_attrib(element, "footer", FOOTER_DEFAULT)
    img_top_src = pl.get_string_attrib(element, "img-top-src", IMG_TOP_SRC_DEFAULT)
    img_top_alt = pl.get_string_attrib(element, "img-top-alt", IMG_TOP_ALT_DEFAULT)
    img_bottom_src = pl.get_string_attrib(
        element, "img-bottom-src", IMG_BOTTOM_SRC_DEFAULT
    )
    img_bottom_alt = pl.get_string_attrib(
        element, "img-bottom-alt", IMG_BOTTOM_ALT_DEFAULT
    )
    width = pl.get_string_attrib(element, "width", WIDTH_DEFAULT)

    if width not in {"25%", "50%", "75%", "auto"}:
        raise ValueError(f"Invalid width: {width}.")

    content = pl.inner_html(element)

    html_params: dict[str, Any] = {
        "header": header,
        "subtitle": subtitle,
        "footer": footer,
        "img-top-src": img_top_src,
        "img-top-alt": img_top_alt,
        "img-bottom-src": img_bottom_src,
        "img-bottom-alt": img_bottom_alt,
        "width": width.removesuffix("%"),
        "content": content,
    }
    # due to linked workaround, empty titles will still trigger {{#title}},
    # so keep empty titles out of params entirely
    if title:
        html_params["title"] = {
            "title": title  # https://github.com/noahmorrison/chevron/issues/117
        }

    with open("pl-card.mustache", "r", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()
