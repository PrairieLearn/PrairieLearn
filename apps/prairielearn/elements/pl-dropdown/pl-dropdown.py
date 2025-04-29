import random
from enum import Enum

import chevron
import lxml.html
import prairielearn as pl
from typing_extensions import assert_never

WEIGHT_DEFAULT = 1
BLANK_ANSWER = " "
BLANK_DEFAULT = True
SORT_DEFAULT = "random"
ALLOW_BLANK_DEFAULT = False


class SortTypes(Enum):
    RANDOM = "random"
    ASCEND = "ascend"
    DESCEND = "descend"
    FIXED = "fixed"


def get_options(
    element: lxml.html.HtmlElement, data: pl.QuestionData
) -> list[dict[str, str | bool]]:
    answers_name = pl.get_string_attrib(element, "answers-name")
    submitted_answer = data.get("submitted_answers", {}).get(answers_name, None)
    options = []
    for child in element:
        if child.tag == "pl-answer":
            pl.check_attribs(child, required_attribs=[], optional_attribs=["correct"])
            child_html = pl.inner_html(child).strip()
            options.append({
                "value": child_html,
                "selected": (child_html == submitted_answer),
            })
    return options


def get_solution(element: lxml.html.HtmlElement, data: pl.QuestionData) -> str:
    solution = []
    for child in element:
        if child.tag == "pl-answer":
            pl.check_attribs(child, required_attribs=[], optional_attribs=["correct"])
            is_correct = pl.get_boolean_attrib(child, "correct", False)
            child_html = pl.inner_html(child).strip()
            if is_correct:
                solution.append(child_html)

    if len(solution) > 1:
        raise RuntimeError("Multiple correct answers were set")

    return solution[0]


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(
        element,
        required_attribs=["answers-name"],
        optional_attribs=["blank", "allow-blank", "weight", "sort", "label"],
    )

    if pl.get_boolean_attrib(
        element, "allow-blank", ALLOW_BLANK_DEFAULT
    ) and not pl.get_boolean_attrib(element, "blank", BLANK_DEFAULT):
        raise ValueError(
            'The attribute "allow-blank" cannot be enabled when blank dropdown entries are disabled by the "blank" attribute.'
        )

    answers_name = pl.get_string_attrib(element, "answers-name")
    pl.check_answers_names(data, answers_name)

    # Get answer from pl-answer if implemented
    data["correct_answers"][answers_name] = get_solution(element, data)

    if data["correct_answers"][answers_name] is None:
        raise ValueError(f"Correct answer not defined for answers-name: {answers_name}")


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    answers_name = pl.get_string_attrib(element, "answers-name")
    aria_label = pl.get_string_attrib(element, "label", None)
    dropdown_options = get_options(element, data)
    submitted_answer = data["submitted_answers"].get(answers_name, None)

    sort_type = pl.get_string_attrib(element, "sort", SORT_DEFAULT).upper().strip()
    blank_start = pl.get_boolean_attrib(element, "blank", BLANK_DEFAULT)

    correct = None
    partial_score = data["partial_scores"].get(answers_name, {"score": None})
    score = partial_score.get("score", None)
    if score is not None:
        try:
            score = float(score)
            if score == 1:
                correct = True
            else:
                correct = False
        except Exception as exc:
            raise ValueError("invalid score: " + str(score)) from exc

    html_params = {}
    if data["panel"] == "question":
        if sort_type == SortTypes.FIXED.name:
            pass
        elif sort_type == SortTypes.DESCEND.name:
            dropdown_options.sort(key=lambda opt: opt["value"], reverse=True)
        elif sort_type == SortTypes.ASCEND.name:
            dropdown_options.sort(key=lambda opt: opt["value"], reverse=False)
        elif sort_type == SortTypes.RANDOM.name:
            random.shuffle(dropdown_options)

        if blank_start:
            dropdown_options.insert(
                0,
                {"value": BLANK_ANSWER, "selected": (submitted_answer == BLANK_ANSWER)},
            )

        html_params = {
            "answers-name": answers_name,
            "question": True,
            "options": dropdown_options,
            "has_submission": correct is not None,
            "editable": data["editable"],
            "correct": correct,
            "aria_label": aria_label,
        }

    elif data["panel"] == "submission":
        html_params = {
            "parse-error": data["format_errors"].get(answers_name, None),
            "submission": True,
            "submitted-answer": submitted_answer,
            "display-score-badge": correct is not None,
            "correct": correct,
        }

    elif data["panel"] == "answer":
        html_params = {
            "answer": True,
            "correct-answer": data["correct_answers"][answers_name],
        }
    else:
        assert_never(data["panel"])

    with open("pl-dropdown.mustache", encoding="utf-8") as f:
        html = chevron.render(f, html_params).strip()
    return html


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    answers_name = pl.get_string_attrib(element, "answers-name")
    answer = data["submitted_answers"].get(answers_name, None)

    # Blank option should be available, but cause format error when submitted and blank is not allowed.
    valid_options = [BLANK_ANSWER]

    for child in element:
        if child.tag == "pl-answer":
            pl.check_attribs(child, required_attribs=[], optional_attribs=["correct"])
            child_html = pl.inner_html(child).strip()
            valid_options.append(child_html)

    if answer is BLANK_ANSWER and not allow_blank:
        data["format_errors"][answers_name] = "The submitted answer was left blank."

    if answer is None:
        data["format_errors"][answers_name] = "No answer was submitted."

    if answer not in valid_options:
        data["format_errors"][answers_name] = "Invalid option submitted."


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    answers_name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    submitted_answer = data["submitted_answers"].get(answers_name, None)

    if data["correct_answers"][answers_name] == submitted_answer:
        data["partial_scores"][answers_name] = {"score": 1, "weight": weight}
    else:
        data["partial_scores"][answers_name] = {"score": 0, "weight": weight}


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    answers_name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    # solution is what the answer should be
    solution = get_solution(element, data)

    # incorrect and correct answer test cases
    if data["test_type"] == "correct":
        data["raw_submitted_answers"][answers_name] = solution
        data["partial_scores"][answers_name] = {"score": 1, "weight": weight}
    elif data["test_type"] == "incorrect":
        dropdown_options = get_options(element, data)
        incorrect_ans = ""

        for option in dropdown_options:
            if option["value"] != solution:
                incorrect_ans = option["value"]

        data["raw_submitted_answers"][answers_name] = incorrect_ans
        data["partial_scores"][answers_name] = {"score": 0, "weight": weight}
    elif data["test_type"] == "invalid":
        # Test for invalid drop-down options in case injection on front-end
        data["raw_submitted_answers"][answers_name] = "INVALID STRING"
        data["format_errors"][answers_name] = "format error message"
    else:
        raise RuntimeError("invalid result: {}".format(data["test_type"]))
