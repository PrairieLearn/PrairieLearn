import html
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


SPACE_HINT_DICT: dict[tuple[bool, bool], str] = {
    (True, True): "All spaces will be removed from your answer.",
    (True, False): "Leading and trailing spaces will be removed from your answer.",
    (
        False,
        True,
    ): "All spaces between text will be removed but leading and trailing spaces will be left as part of your answer.",
    (False, False): "Leading and trailing spaces will be left as part of your answer.",
}


WEIGHT_DEFAULT = 1
CORRECT_ANSWER_DEFAULT = None
LABEL_DEFAULT = None
ARIA_LABEL_DEFAULT = None
SUFFIX_DEFAULT = None
DISPLAY_DEFAULT = DisplayType.INLINE
REMOVE_LEADING_TRAILING_DEFAULT = False
REMOVE_SPACES_DEFAULT = False
PLACEHOLDER_DEFAULT = None
INITIAL_VALUE_DEFAULT = None
ALLOW_BLANK_DEFAULT = False
IGNORE_CASE_DEFAULT = False
SIZE_DEFAULT = 35
SHOW_HELP_TEXT_DEFAULT = True
SHOW_SCORE_DEFAULT = True
NORMALIZE_TO_ASCII_DEFAULT = False
MULTILINE_DEFAULT = False

STRING_INPUT_MUSTACHE_TEMPLATE_NAME = "pl-string-input.mustache"


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["answers-name"]
    optional_attribs = [
        "weight",
        "correct-answer",
        "label",
        "aria-label",
        "suffix",
        "display",
        "remove-leading-trailing",
        "remove-spaces",
        "allow-blank",
        "ignore-case",
        "placeholder",
        "initial-value",
        "size",
        "show-help-text",
        "normalize-to-ascii",
        "show-score",
        "multiline",
        "escape-unicode",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)

    name = pl.get_string_attrib(element, "answers-name")
    pl.check_answers_names(data, name)

    correct_answer = pl.get_string_attrib(
        element, "correct-answer", CORRECT_ANSWER_DEFAULT
    )

    if correct_answer is not None:
        if name in data["correct_answers"]:
            raise RuntimeError(f'Duplicate correct_answers variable name: "{name}"')
        data["correct_answers"][name] = correct_answer


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    label = pl.get_string_attrib(element, "label", LABEL_DEFAULT)
    aria_label = pl.get_string_attrib(element, "aria-label", ARIA_LABEL_DEFAULT)
    suffix = pl.get_string_attrib(element, "suffix", SUFFIX_DEFAULT)

    remove_spaces = pl.get_boolean_attrib(
        element, "remove-spaces", REMOVE_SPACES_DEFAULT
    )
    placeholder = pl.get_string_attrib(element, "placeholder", PLACEHOLDER_DEFAULT)
    show_score = pl.get_boolean_attrib(element, "show-score", SHOW_SCORE_DEFAULT)

    raw_submitted_answer = data["raw_submitted_answers"].get(name)

    if raw_submitted_answer is None:
        raw_submitted_answer = pl.get_string_attrib(
            element, "initial-value", INITIAL_VALUE_DEFAULT
        )
    multiline = pl.get_boolean_attrib(element, "multiline", MULTILINE_DEFAULT)
    score = data["partial_scores"].get(name, {"score": None}).get("score", None)
    parse_error = data["format_errors"].get(name)

    # Defaults here depend on multiline
    display = pl.get_enum_attrib(
        element,
        "display",
        DisplayType,
        DisplayType.BLOCK if multiline else DISPLAY_DEFAULT,
    )

    if display is DisplayType.INLINE and multiline:
        raise ValueError('Display cannot be "inline" for multiline input.')

    remove_leading_trailing = pl.get_boolean_attrib(
        element, "remove-leading-trailing", multiline or REMOVE_LEADING_TRAILING_DEFAULT
    )

    # Get template
    with open(STRING_INPUT_MUSTACHE_TEMPLATE_NAME, encoding="utf-8") as f:
        template = f.read()

    if data["panel"] == "question":
        editable = data["editable"]

        space_hint = SPACE_HINT_DICT[remove_leading_trailing, remove_spaces]
        info = f"Your answer must be a piece of text (sequence of letters, numbers, and characters). Any symbolic expressions or numbers will be interpreted as text. {space_hint}"

        show_help_text = pl.get_boolean_attrib(
            element, "show-help-text", SHOW_HELP_TEXT_DEFAULT
        )

        html_params = {
            "question": True,
            "name": name,
            "label": label,
            "aria_label": aria_label,
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
            "multiline": multiline,
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
            "multiline": multiline,
            display.value: True,
        }

        if parse_error is None and name in data["submitted_answers"]:
            # Get submitted answer, raising an exception if it does not exist
            a_sub = data["submitted_answers"].get(name, None)

            if a_sub is None:
                raise RuntimeError("submitted answer is None")

            html_params["escaped_submitted_answer"] = html.escape(
                pl.escape_unicode_string(a_sub)
            )
            html_params["a_sub"] = a_sub
        elif name not in data["submitted_answers"]:
            html_params["missing_input"] = True
            html_params["parse_error"] = None
        else:
            html_params["raw_submitted_answer"] = raw_submitted_answer

        if show_score and score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

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
            "multiline": multiline,
            "uuid": pl.get_uuid(),
            display.value: True,
            # Some users were putting numbers into the correct answer. For
            # backwards compatibility, always convert the answer to a string.
            "escaped_correct_answer": html.escape(pl.escape_unicode_string(str(a_tru))),
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

    multiline = pl.get_boolean_attrib(element, "multiline", MULTILINE_DEFAULT)
    remove_leading_trailing = pl.get_boolean_attrib(
        element, "remove-leading-trailing", multiline or REMOVE_LEADING_TRAILING_DEFAULT
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

    # Always simplify multiline characters (if they still exist)
    a_sub = a_sub.replace("\r\n", "\n")

    if not a_sub and not allow_blank:
        data["format_errors"][name] = (
            "Invalid format. The submitted answer was left blank."
        )
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

    multiline = pl.get_boolean_attrib(element, "multiline", MULTILINE_DEFAULT)
    # Get remove-leading-trailing option
    remove_leading_trailing = pl.get_boolean_attrib(
        element, "remove-leading-trailing", multiline or REMOVE_LEADING_TRAILING_DEFAULT
    )

    # Get string case sensitivity option
    ignore_case = pl.get_boolean_attrib(element, "ignore-case", IGNORE_CASE_DEFAULT)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = pl.from_json(data["correct_answers"].get(name, None))
    if a_tru is None:
        return

    # Always simplify multiline characters (if they still exist)
    a_tru = str(a_tru).replace("\r\n", "\n")

    # explicitly cast the true answer to a string, to handle the case where the answer might be a number or some other type
    a_tru_str = str(a_tru)

    def grade_function(a_sub: Any) -> tuple[bool, None]:
        # explicitly cast the submitted answer to a string
        a_sub_str = str(a_sub)

        nonlocal a_tru_str

        # Remove the leading and trailing characters
        if remove_leading_trailing:
            a_sub_str = a_sub_str.strip()
            a_tru_str = a_tru_str.strip()

        # Remove the blank spaces between characters
        if remove_spaces:
            a_sub_str = "".join(a_sub_str.split())
            a_tru_str = "".join(a_tru_str.split())

        # Modify string case for submission and true answer to be lower.
        if ignore_case:
            a_sub_str = a_sub_str.lower()
            a_tru_str = a_tru_str.lower()

        return a_tru_str == a_sub_str, None

    pl.grade_answer_parameterized(data, name, grade_function, weight=weight)


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    result = data["test_type"]

    a_tru = ""
    if result in ["correct", "incorrect"]:
        if name not in data["correct_answers"]:
            # This element cannot test itself. Defer the generation of test inputs to server.py
            return

        # Get correct answer
        a_tru = data["correct_answers"][name]

        # If correct answer is in a format generated by pl.to_json, convert it
        # back to a standard type (otherwise, do nothing)
        #
        # Some users were putting numbers into the correct answer. For
        # backwards compatibility, always convert the answer to a string.
        a_tru = str(pl.from_json(a_tru))

    if result == "invalid" and allow_blank:
        # We can't have an invalid submission with allow_blank, so just test correct
        result = "correct"

    if result == "correct":
        data["raw_submitted_answers"][name] = a_tru
        data["partial_scores"][name] = {"score": 1, "weight": weight}
    elif result == "incorrect":
        data["raw_submitted_answers"][name] = a_tru + str(
            random.randint(1, 11) * random.choice([-1, 1])
        )
        data["partial_scores"][name] = {"score": 0, "weight": weight}
    elif result == "invalid":
        data["raw_submitted_answers"][name] = ""
        data["format_errors"][name] = "invalid"
    else:
        assert_never(result)
