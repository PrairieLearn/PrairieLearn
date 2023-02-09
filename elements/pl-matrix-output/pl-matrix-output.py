import lxml.html
import prairielearn as pl

DIGITS_DEFAULT = 2


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=[], optional_attribs=["digits"])


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)

    return f"""
    <pl-variable-output show-r="False" show-mathematica="False" show-sympy="False" digits="{digits}">
        {pl.inner_html(element)}
    </pl-variable-output>
    """
