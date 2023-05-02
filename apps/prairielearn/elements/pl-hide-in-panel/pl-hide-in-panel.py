import lxml.html
import prairielearn as pl

QUESTION_DEFAULT = False
SUBMISSION_DEFAULT = False
ANSWER_DEFAULT = False


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = ["question", "submission", "answer"]
    pl.check_attribs(element, required_attribs, optional_attribs)


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    hide_in_question = pl.get_boolean_attrib(element, "question", QUESTION_DEFAULT)
    hide_in_submission = pl.get_boolean_attrib(
        element, "submission", SUBMISSION_DEFAULT
    )
    hide_in_answer = pl.get_boolean_attrib(element, "answer", ANSWER_DEFAULT)
    if (
        (data["panel"] == "question" and not hide_in_question)
        or (data["panel"] == "submission" and not hide_in_submission)
        or (data["panel"] == "answer" and not hide_in_answer)
    ):
        return pl.inner_html(element)

    return ""
