import random

import chevron
import lxml.html
import prairielearn as pl
from typing_extensions import assert_never

FEEDBACK_INCORRECT = "You didn't click on the image the correct number of times"
FEEDBACK_TOOSMALL = "Your number was one too small."
FEEDBACK_TOOLARGE = "Your number was one too large."
ERROR_NOSUBMISSION = "Answer not submitted"


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=["answers-name"], optional_attribs=[])

    name = pl.get_string_attrib(element, "answers-name")
    number = random.randint(0, 9)
    data["params"][name] = number
    data["correct_answers"][name] = number


def render(element_html: str, data: pl.QuestionData) -> str:
    # Grab the name of the element (name of the hidden input tag), and generate a unique UUID
    # Each element on the page has its own UUID to prevent the JavaScript of other elements from interfering
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    uuid = pl.get_uuid()

    if data["panel"] == "question":
        html_params = {
            "question": True,
            "number": data["params"][name],
            "answers_name": name,
            "image_url": data["options"]["client_files_element_url"] + "/block_i.png",
            "uuid": uuid,
        }
    elif data["panel"] == "submission":
        feedback = data["partial_scores"][name].get("feedback", None)
        html_params = {
            "submission": True,
            "submitted": data["raw_submitted_answers"][name],
            "feedback": feedback,
        }
    elif data["panel"] == "answer":
        html_params = {"answer": True, "correct": data["correct_answers"][name]}

    with open("clickable-image.mustache") as f:
        return chevron.render(f, html_params).strip()


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")

    # Grab the number of clicks in the hidden field and put it into submitted answers
    # Each "input" field is automatically saved into "raw_submitted_answers"
    if name not in data["raw_submitted_answers"]:
        data["submitted_answers"][name] = None
        data["format_errors"][name] = ERROR_NOSUBMISSION
        return

    data["submitted_answers"][name] = int(data["raw_submitted_answers"][name])


def grade(element_html: str, data: pl.QuestionData) -> None:
    # Get the name of the element and the weight for this answer
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", 1)

    # Get the number of submitted clicks and the correct number of clicks
    submitted_answer = data["submitted_answers"][name]
    correct_answer = data["correct_answers"][name]
    score = 0.0
    feedback = None

    # Grade the actual number of clicks
    if submitted_answer == correct_answer:
        score = 1.0
    elif submitted_answer == correct_answer - 1:
        score = 0.75
        feedback = FEEDBACK_TOOSMALL
    elif submitted_answer == correct_answer + 1:
        score = 0.5
        feedback = FEEDBACK_TOOLARGE
    else:
        score = 0
        feedback = FEEDBACK_INCORRECT

    # Put the score, weight, and feedback into the data object
    data["partial_scores"][name] = {
        "score": score,
        "weight": weight,
        "feedback": feedback,
    }


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", 1)
    result = data["test_type"]

    if result == "correct":
        data["raw_submitted_answers"][name] = str(data["correct_answers"][name])
    elif result == "incorrect":
        data["raw_submitted_answers"][name] = str(data["correct_answers"][name] + 2)
        data["partial_scores"][name] = {
            "score": 0,
            "weight": weight,
            "feedback": FEEDBACK_INCORRECT,
        }
    elif result == "invalid":
        data["format_errors"][name] = ERROR_NOSUBMISSION
    else:
        assert_never(result)
