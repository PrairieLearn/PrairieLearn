import lxml.html
import prairielearn as pl


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, [], [])


def render(element_html, data):
    if not data["manual_grading"]:
        element = lxml.html.fragment_fromstring(element_html)
        return pl.inner_html(element)
    else:
        return ""
