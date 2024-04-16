import random
from enum import Enum
from typing import Any

import chevron
import lxml.html
import prairielearn as pl
from typing_extensions import assert_never


class DisplayType(Enum):
    INLINE = "inline"
    BLOCK = "block"


WEIGHT_DEFAULT = 1
CORRECT_ANSWER_DEFAULT = None
LABEL_DEFAULT = None
SUFFIX_DEFAULT = None
DISPLAY_DEFAULT = DisplayType.INLINE
REMOVE_LEADING_TRAILING_DEFAULT = False
REMOVE_SPACES_DEFAULT = False
PLACEHOLDER_DEFAULT = None
ALLOW_BLANK_DEFAULT = False
IGNORE_CASE_DEFAULT = False
SIZE_DEFAULT = 35
SHOW_HELP_TEXT_DEFAULT = True
SHOW_SCORE_DEFAULT = True
NORMALIZE_TO_ASCII_DEFAULT = False

STRING_INPUT_MUSTACHE_TEMPLATE_NAME = "pl-string-input.mustache"


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["answers-name"]
    optional_attribs = [
        "weight",
        "correct-answer",
        "label",
        "suffix",
        "display",
        "remove-leading-trailing",
        "remove-spaces",
        "allow-blank",
        "ignore-case",
        "placeholder",
        "size",
        "show-help-text",
        "normalize-to-ascii",
        "show-score",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)

    name = pl.get_string_attrib(element, "answers-name")
    pl.check_answers_names(data, name)

    correct_answer = pl.get_string_attrib(
        element, "correct-answer", CORRECT_ANSWER_DEFAULT
    )

    if correct_answer is not None:
        if name in data["correct_answers"]:
            raise Exception(f'Duplicate correct_answers variable name: "{name}"')
        data["correct_answers"][name] = correct_answer


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    label = pl.get_string_attrib(element, "label", LABEL_DEFAULT)
    suffix = pl.get_string_attrib(element, "suffix", SUFFIX_DEFAULT)
    display = pl.get_enum_attrib(element, "display", DisplayType, DISPLAY_DEFAULT)
    remove_leading_trailing = pl.get_boolean_attrib(
        element, "remove-leading-trailing", REMOVE_LEADING_TRAILING_DEFAULT
    )
    remove_spaces = pl.get_boolean_attrib(
        element, "remove-spaces", REMOVE_SPACES_DEFAULT
    )
    placeholder = pl.get_string_attrib(element, "placeholder", PLACEHOLDER_DEFAULT)
    show_score = pl.get_boolean_attrib(element, "show-score", SHOW_SCORE_DEFAULT)

    raw_submitted_answer = data["raw_submitted_answers"].get(name)

    score = data["partial_scores"].get(name, {"score": None}).get("score", None)
    parse_error = data["format_errors"].get(name)

    # Get template
    with open(STRING_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
        template = f.read()

    if data["panel"] == "question":
        editable = data["editable"]

        space_hint_pair = (remove_leading_trailing, remove_spaces)
        match space_hint_pair:
            case (True, True):
                space_hint = "All spaces will be removed from your answer."
            case (True, False):
                space_hint = (
                    "Leading and trailing spaces will be removed from your answer."
                )
            case (False, True):
                space_hint = "All spaces between text will be removed but leading and trailing spaces will be left as part of your answer."
            case (False, False):
                space_hint = (
                    "Leading and trailing spaces will be left as part of your answer."
                )
            case _:
                raise Exception("Should never reach here.")

        info_params = {"format": True, "space_hint": space_hint}
        info = chevron.render(template, info_params).strip()

        show_help_text = pl.get_boolean_attrib(
            element, "show-help-text", SHOW_HELP_TEXT_DEFAULT
        )

        html_params = {
            "question": True,
            "name": name,
            "label": label,
            "suffix": suffix,
            "editable": editable,
            "info": info,
            "placeholder": placeholder,
            "size": pl.get_integer_attrib(element, "size", SIZE_DEFAULT),
            "show_info": show_help_text,
            "uuid": pl.get_uuid(),
            display.value: True,
            "raw_submitted_answer": raw_submitted_answer,
            "parse_error": parse_error,
        }

        if show_score and score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        return chevron.render(template, html_params).strip()

    elif data["panel"] == "submission":
        html_params = {
            "submission": True,
            "label": label,
            "suffix": suffix,
            "parse_error": parse_error,
            "uuid": pl.get_uuid(),
        }

        if parse_error is None and name in data["submitted_answers"]:
            # Get submitted answer, raising an exception if it does not exist
            a_sub = data["submitted_answers"].get(name, None)
            if a_sub is None:
                raise Exception("submitted answer is None")

            # If answer is in a format generated by pl.to_json, convert it
            # back to a standard type (otherwise, do nothing)
            a_sub = pl.from_json(a_sub)
            a_sub = pl.escape_unicode_string(a_sub)

            html_params["a_sub"] = a_sub
        elif name not in data["submitted_answers"]:
            html_params["missing_input"] = True
            html_params["parse_error"] = None
        else:
            html_params["raw_submitted_answer"] = raw_submitted_answer

        if show_score and score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        html_params["error"] = html_params["parse_error"] or html_params.get(
            "missing_input", False
        )

        return chevron.render(template, html_params).strip()

    elif data["panel"] == "answer":
        a_tru = pl.from_json(data["correct_answers"].get(name, None))
        if a_tru is None:
            return ""

        html_params = {
            "answer": True,
            "label": label,
            "a_tru": a_tru,
            "suffix": suffix,
        }

        return chevron.render(template, html_params).strip()

    assert_never(data["panel"])


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    # Get allow-blank option
    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    normalize_to_ascii = pl.get_boolean_attrib(
        element, "normalize-to-ascii", NORMALIZE_TO_ASCII_DEFAULT
    )
    remove_spaces = pl.get_boolean_attrib(
        element, "remove-spaces", REMOVE_SPACES_DEFAULT
    )

    remove_leading_trailing = pl.get_boolean_attrib(
        element, "remove-leading-trailing", REMOVE_LEADING_TRAILING_DEFAULT
    )

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data["submitted_answers"].get(name, None)
    if a_sub is None:
        data["format_errors"][name] = "No submitted answer."
        data["submitted_answers"][name] = None
        return

    # Do unicode decode
    if normalize_to_ascii:
        a_sub = pl.full_unidecode(a_sub)

    # Remove the leading and trailing characters
    if remove_leading_trailing:
        a_sub = a_sub.strip()

    # Remove the blank spaces between characters
    if remove_spaces:
        a_sub = "".join(a_sub.split())

    if not a_sub and not allow_blank:
        data["format_errors"][
            name
        ] = "Invalid format. The submitted answer was left blank."
        data["submitted_answers"][name] = None
    else:
        data["submitted_answers"][name] = pl.to_json(a_sub)


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")

    # Get weight
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    # Get remove-spaces option
    remove_spaces = pl.get_boolean_attrib(
        element, "remove-spaces", REMOVE_SPACES_DEFAULT
    )

    # Get remove-leading-trailing option
    remove_leading_trailing = pl.get_boolean_attrib(
        element, "remove-leading-trailing", REMOVE_LEADING_TRAILING_DEFAULT
    )

    # Get string case sensitivity option
    ignore_case = pl.get_boolean_attrib(element, "ignore-case", IGNORE_CASE_DEFAULT)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = pl.from_json(data["correct_answers"].get(name, None))
    if a_tru is None:
        return

    # explicitly cast the true answer to a string, to handle the case where the answer might be a number or some other type
    a_tru = str(a_tru)

    def grade_function(a_sub: Any) -> tuple[bool, None]:
        # If submitted answer is in a format generated by pl.to_json, convert it
        # back to a standard type (otherwise, do nothing)
        a_sub = pl.from_json(a_sub)

        # explicitly cast the submitted answer to a string
        a_sub = str(a_sub)

        nonlocal a_tru

        # Remove the leading and trailing characters
        if remove_leading_trailing:
            a_sub = a_sub.strip()
            a_tru = a_tru.strip()

        # Remove the blank spaces between characters
        if remove_spaces:
            a_sub = "".join(a_sub.split())
            a_tru = "".join(a_tru.split())

        # Modify string case for submission and true answer to be lower.
        if ignore_case:
            a_sub = a_sub.lower()
            a_tru = a_tru.lower()

        return a_tru == a_sub, None

    pl.grade_answer_parameterized(data, name, grade_function, weight=weight)


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)

    # Get correct answer
    a_tru = data["correct_answers"][name]

    # If correct answer is in a format generated by pl.to_json, convert it
    # back to a standard type (otherwise, do nothing)
    a_tru = pl.from_json(a_tru)

    result = data["test_type"]
    if result == "invalid" and allow_blank:
        # We can't have an invalid submission with allow_blank, so just test correct
        result = "correct"

    if result == "correct":
        data["raw_submitted_answers"][name] = a_tru
        data["partial_scores"][name] = {"score": 1, "weight": weight}
    elif result == "incorrect":
        data["raw_submitted_answers"][name] = a_tru + str(
            (random.randint(1, 11) * random.choice([-1, 1]))
        )
        data["partial_scores"][name] = {"score": 0, "weight": weight}
    elif result == "invalid":
        data["raw_submitted_answers"][name] = ""
        data["format_errors"][name] = "invalid"
    else:
        assert_never(result)
