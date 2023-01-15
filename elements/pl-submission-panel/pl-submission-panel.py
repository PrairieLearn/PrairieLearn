import lxml.html
import prairielearn as pl


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=[], optional_attribs=[])


def render(element_html: str, data: pl.QuestionData) -> str:
    if data["panel"] == "submission":
        element = lxml.html.fragment_fromstring(element_html)
        return pl.inner_html(element)

    return ""
