import random
from enum import Enum
from typing import Any

import chevron
import lxml.html
import numpy
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
SIZE_DEFAULT = 35
SHOW_HELP_TEXT_DEFAULT = True
ALLOW_BLANK_DEFAULT = False
BLANK_VALUE_DEFAULT = 0
BASE_DEFAULT = 10
SHOW_SCORE_DEFAULT = True

INTEGER_INPUT_MUSTACHE_TEMPLATE_NAME = "pl-integer-input.mustache"


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["answers-name"]
    optional_attribs = [
        "weight",
        "correct-answer",
        "label",
        "suffix",
        "display",
        "size",
        "show-help-text",
        "base",
        "allow-blank",
        "blank-value",
        "placeholder",
        "show-score",
    ]

    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, "answers-name")
    pl.check_answers_names(data, name)

    base = pl.get_integer_attrib(element, "base", BASE_DEFAULT)

    if base != 0 and (base < 2 or base > 36):
        raise ValueError(f"Base must be either 0, or between 2 and 36, not {base}")

    correct_answer = pl.get_string_attrib(
        element, "correct-answer", CORRECT_ANSWER_DEFAULT
    )
    if correct_answer is not None:
        if name in data["correct_answers"]:
            raise ValueError(f"Duplicate correct_answers variable name: {name}")
        data["correct_answers"][name] = correct_answer
    else:
        correct_answer = pl.from_json(data["correct_answers"].get(name, None))

    # Test conversion, but leave as string so proper value is shown on answer panel
    if correct_answer is not None and not isinstance(correct_answer, int):
        try:
            int(str(correct_answer), base)
        except Exception:
            raise ValueError(
                f"Correct answer is not a valid base {base} integer: {correct_answer}"
            )


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    label = pl.get_string_attrib(element, "label", LABEL_DEFAULT)
    suffix = pl.get_string_attrib(element, "suffix", SUFFIX_DEFAULT)
    display = pl.get_enum_attrib(element, "display", DisplayType, DISPLAY_DEFAULT)
    size = pl.get_integer_attrib(element, "size", SIZE_DEFAULT)
    base = pl.get_integer_attrib(element, "base", BASE_DEFAULT)
    show_info = pl.get_boolean_attrib(element, "show-help-text", SHOW_HELP_TEXT_DEFAULT)
    show_score = pl.get_boolean_attrib(element, "show-score", SHOW_SCORE_DEFAULT)

    parse_error = data["format_errors"].get(name)
    raw_submitted_answer = data["raw_submitted_answers"].get(name)
    score = data["partial_scores"].get(name, {"score": None}).get("score")

    with open(INTEGER_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
        template = f.read()

    if data["panel"] == "question":
        editable = data["editable"]

        # Get info strings
        info_params = {
            "format": True,
            "base": base,
            "default_base": base == BASE_DEFAULT or base == 0,
            "zero_base": base == 0,
        }

        info = chevron.render(template, info_params).strip()

        if pl.has_attrib(element, "placeholder"):
            placeholder = pl.get_string_attrib(element, "placeholder")
        else:
            placeholder = (
                "integer" if base == BASE_DEFAULT else f"integer in base {base}"
            )

        html_params = {
            "question": True,
            "name": name,
            "label": label,
            "suffix": suffix,
            "editable": editable,
            "info": info,
            "placeholder": placeholder,
            "size": size,
            "base": base,
            "show_info": show_info,
            "uuid": pl.get_uuid(),
            display.value: True,
            "parse_error": parse_error,
            "use_numeric": True if 1 <= base <= 10 else False,
            "raw_submitted_answer": raw_submitted_answer,
        }

        if show_score and score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        return chevron.render(template, html_params).strip()

    elif data["panel"] == "submission":
        html_params = {
            "submission": True,
            "label": label,
            "base": base,
            "default_base": base == BASE_DEFAULT or base == 0,
            "parse_error": parse_error,
            "uuid": pl.get_uuid(),
        }

        if parse_error is None and name in data["submitted_answers"]:
            # Get submitted answer, raising a ValueError if it does not exist
            a_sub = data["submitted_answers"].get(name)
            if a_sub is None:
                raise ValueError(f"Submitted answer is None for {name}")

            # If answer is a string, convert back to an integer.
            # Else if answer is in a format generated by pl.to_json, convert it
            # back to a standard type. Otherwise do nothing.
            if isinstance(a_sub, str):
                a_sub_parsed = int(a_sub)
            else:
                a_sub_parsed = pl.from_json(a_sub)

            html_params["suffix"] = suffix
            html_params["a_sub"] = (
                numpy.base_repr(a_sub_parsed, base)
                if base > 0
                else data["raw_submitted_answers"].get(name, str(a_sub_parsed))
            )

        elif name not in data["submitted_answers"]:
            html_params["missing_input"] = True
            html_params["parse_error"] = None
        else:
            if raw_submitted_answer is not None:
                html_params["raw_submitted_answer"] = pl.escape_unicode_string(
                    raw_submitted_answer
                )

        if show_score and score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        html_params["error"] = html_params["parse_error"] or html_params.get(
            "missing_input", False
        )

        return chevron.render(template, html_params).strip()

    elif data["panel"] == "answer":
        a_tru = pl.from_json(data["correct_answers"].get(name))
        if a_tru is None:
            return ""

        if isinstance(a_tru, str):
            a_tru_str = a_tru
        else:
            a_tru_str = numpy.base_repr(a_tru, base if base > 0 else 10)
        html_params = {
            "answer": True,
            "label": label,
            "a_tru": a_tru_str,
            "suffix": suffix,
        }

        return chevron.render(template, html_params).strip()

    assert_never(data["panel"])


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    base = pl.get_integer_attrib(element, "base", BASE_DEFAULT)

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data["submitted_answers"].get(name)

    if a_sub is None:
        data["format_errors"][name] = "No submitted answer."
        data["submitted_answers"][name] = None
        return

    a_sub = str(a_sub)

    with open(INTEGER_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
        template = f.read()

    if a_sub.strip() == "":
        if pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT):
            a_sub = str(
                pl.get_integer_attrib(element, "blank-value", BLANK_VALUE_DEFAULT)
            )
        else:
            opts = {
                "format_error": True,
                "format_error_message": "the submitted answer was blank.",
                "base": base,
                "default_base": base == BASE_DEFAULT or base == 0,
                "zero_base": base == 0,
            }

            data["format_errors"][name] = chevron.render(template, opts).strip()
            data["submitted_answers"][name] = None
            return

    # Convert to integer
    a_sub_parsed = pl.string_to_integer(a_sub, base)
    if a_sub_parsed is None:
        opts = {
            "format_error": True,
            "base": base,
            "default_base": base == BASE_DEFAULT or base == 0,
            "zero_base": base == 0,
        }

        data["format_errors"][name] = chevron.render(template, opts).strip()
        data["submitted_answers"][name] = None
    elif not pl.is_int_json_serializable(a_sub_parsed):
        data["submitted_answers"][name] = str(a_sub_parsed)
    else:
        data["submitted_answers"][name] = a_sub_parsed


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    base = pl.get_integer_attrib(element, "base", BASE_DEFAULT)

    # Get weight
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = pl.from_json(data["correct_answers"].get(name))
    if a_tru is None:
        return

    a_tru_parsed = (
        pl.string_to_integer(a_tru, base) if isinstance(a_tru, str) else int(a_tru)
    )

    def grade_function(a_sub: Any) -> tuple[bool, None]:
        # If submitted answer is in a format generated by pl.to_json, convert it
        # back to a standard type (otherwise, do nothing)
        a_sub = pl.from_json(a_sub)

        a_sub_parsed = (
            pl.string_to_integer(a_sub, base) if isinstance(a_sub, str) else int(a_sub)
        )

        return a_tru_parsed == a_sub_parsed, None

    pl.grade_answer_parameterized(data, name, grade_function, weight=weight)


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    base = pl.get_integer_attrib(element, "base", BASE_DEFAULT)

    # Get correct answer
    a_tru = data["correct_answers"][name]

    # If correct answer is in a format generated by pl.to_json, convert it
    # back to a standard type (otherwise, do nothing)
    a_tru_parsed = pl.from_json(a_tru)
    if isinstance(a_tru_parsed, str):
        a_tru_parsed = pl.string_to_integer(a_tru_parsed, base)

    if a_tru_parsed is None:
        raise ValueError(f"Could not parse correct answer: {a_tru}")

    result = data["test_type"]
    if result == "correct":
        if base > 0:
            data["raw_submitted_answers"][name] = numpy.base_repr(a_tru_parsed, base)
        elif random.choice([True, False]):
            data["raw_submitted_answers"][name] = numpy.base_repr(a_tru_parsed, 10)
        else:
            # Use 0x format
            data["raw_submitted_answers"][name] = f"{a_tru_parsed:#x}"
        data["partial_scores"][name] = {"score": 1, "weight": weight}
    elif result == "incorrect":
        data["raw_submitted_answers"][name] = numpy.base_repr(
            a_tru_parsed + (random.randint(1, 11) * random.choice([-1, 1])),
            base if base > 0 else 10,
        )
        data["partial_scores"][name] = {"score": 0, "weight": weight}
    elif result == "invalid":
        invalid_chr = chr(ord("a") + (base - BASE_DEFAULT) + 1)
        incorrect_answers = ["1 + 2", "3.4", invalid_chr, "pi"]

        data["raw_submitted_answers"][name] = random.choice(incorrect_answers)
        data["format_errors"][name] = "invalid"
    else:
        assert_never(result)
