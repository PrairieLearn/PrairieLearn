import random
from enum import Enum
from sys import get_int_max_str_digits

import big_o_utils as bou
import chevron
import lxml.html
import prairielearn as pl
import prairielearn.sympy_utils as psu
import sympy
from typing_extensions import assert_never


class BigOType(Enum):
    BIG_O = r"O"
    THETA = r"\Theta"
    OMEGA = r"\Omega"
    LITTLE_O = r"o"
    LITTLE_OMEGA = r"\omega"


class DisplayType(Enum):
    INLINE = "inline"
    BLOCK = "block"


GRADE_FUNCTION_DICT: dict[BigOType, bou.BigOGradingFunctionT] = {
    BigOType.BIG_O: bou.grade_o_expression,
    BigOType.THETA: bou.grade_theta_expression,
    BigOType.OMEGA: bou.grade_omega_expression,
    BigOType.LITTLE_O: bou.grade_o_expression,
    BigOType.LITTLE_OMEGA: bou.grade_omega_expression,
}

VARIABLES_DEFAULT = ""
SIZE_DEFAULT = 35
SHOW_HELP_TEXT_DEFAULT = True
ARIA_LABEL_DEFAULT = None
WEIGHT_DEFAULT = 1
DISPLAY_DEFAULT = DisplayType.INLINE
BIG_O_TYPE_DEFAULT = BigOType.BIG_O
PLACEHOLDER_DEFAULT = "asymptotic expression"
SHOW_SCORE_DEFAULT = True
ALLOW_BLANK_DEFAULT = False
BLANK_VALUE_DEFAULT = "1"
INITIAL_VALUE_DEFAULT = None
BIG_O_INPUT_MUSTACHE_TEMPLATE_NAME = "pl-big-o-input.mustache"
# This timeout is chosen to allow multiple sympy-based elements to grade on one page,
# while not exceeding the global timeout enforced for Python execution.
SYMPY_TIMEOUT = 3


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["answers-name"]
    optional_attribs = [
        "weight",
        "correct-answer",
        "aria-label",
        "variable",
        "size",
        "display",
        "show-help-text",
        "type",
        "placeholder",
        "show-score",
        "allow-blank",
        "blank-value",
        "initial-value",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)

    name = pl.get_string_attrib(element, "answers-name")
    pl.check_answers_names(data, name)

    variables = psu.get_items_list(
        pl.get_string_attrib(element, "variable", VARIABLES_DEFAULT)
    )

    if len(variables) > 1:
        raise ValueError(f"Only one variable is supported for question {name}")

    if pl.has_attrib(element, "correct-answer"):
        if name in data["correct_answers"]:
            raise ValueError(f"duplicate correct_answers variable name: {name}")

        a_true = pl.get_string_attrib(element, "correct-answer")
        # Validate that the answer can be parsed before storing
        if len(a_true) > 0:
            try:
                psu.convert_string_to_sympy(
                    a_true, variables, allow_complex=False, allow_trig_functions=False
                )
            except psu.BaseSympyError as exc:
                raise ValueError(
                    f'Parsing correct answer "{a_true}" for "{name}" failed.'
                ) from exc

        data["correct_answers"][name] = a_true

    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    blank_value = pl.get_string_attrib(element, "blank-value", BLANK_VALUE_DEFAULT)
    if data["correct_answers"][name] == "" and (not allow_blank or blank_value != ""):
        raise ValueError(
            "Correct answer cannot be blank unless 'allow-blank' is true and 'blank-value' is empty."
        )


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    aria_label = pl.get_string_attrib(element, "aria-label", ARIA_LABEL_DEFAULT)
    variables = psu.get_items_list(
        pl.get_string_attrib(element, "variable", VARIABLES_DEFAULT)
    )
    display = pl.get_enum_attrib(element, "display", DisplayType, DISPLAY_DEFAULT)
    size = pl.get_integer_attrib(element, "size", SIZE_DEFAULT)

    bigo_type = pl.get_enum_attrib(element, "type", BigOType, BIG_O_TYPE_DEFAULT).value
    placeholder = pl.get_string_attrib(element, "placeholder", PLACEHOLDER_DEFAULT)
    show_score = pl.get_boolean_attrib(element, "show-score", SHOW_SCORE_DEFAULT)
    show_info = pl.get_boolean_attrib(element, "show-help-text", SHOW_HELP_TEXT_DEFAULT)

    parse_error = data["format_errors"].get(name)

    constants_class = psu._Constants()

    operators: list[str] = list(psu.STANDARD_OPERATORS)
    operators.extend(constants_class.functions.keys())

    constants = list(constants_class.variables.keys())

    # Get the info string using these parameters
    info_params = {
        "format": True,
        "variables": variables,
        "operators": operators,
        "constants": constants,
    }

    with open(BIG_O_INPUT_MUSTACHE_TEMPLATE_NAME, encoding="utf-8") as f:
        template = f.read()

    info = chevron.render(template, info_params).strip()

    # First, prepare the parse error since this gets used in multiple panels
    parse_error: str | None = data["format_errors"].get(name)
    missing_input = False
    a_sub = None

    if parse_error is None and name in data["submitted_answers"]:
        a_sub = data["submitted_answers"][name]
        if a_sub != "":
            a_sub = sympy.latex(
                psu.convert_string_to_sympy(
                    a_sub,
                    variables,
                    allow_complex=False,
                    allow_trig_functions=False,
                )
            )
    elif name not in data["submitted_answers"]:
        missing_input = True
        parse_error = None
    # Use the existing format text in the invalid popup and render it
    elif parse_error is not None:
        parse_error += chevron.render(
            template, {"format_error": True, "format_string": info}
        ).strip()

    # Next, get some attributes we will use in multiple places
    raw_submitted_answer = data["raw_submitted_answers"].get(name)
    if raw_submitted_answer is None:
        raw_submitted_answer = pl.get_string_attrib(
            element, "initial-value", INITIAL_VALUE_DEFAULT
        )
    score = data["partial_scores"].get(name, {}).get("score")

    # Finally, render each panel
    if data["panel"] == "question":
        editable = data["editable"]
        html_params = {
            "question": True,
            "name": name,
            "editable": editable,
            "info": info,
            "size": size,
            "show_info": show_info,
            "uuid": pl.get_uuid(),
            display.value: True,
            "aria_label": aria_label,
            "placeholder": placeholder,
            "raw_submitted_answer": raw_submitted_answer,
            "type": bigo_type,
            "parse_error": parse_error,
        }

        if show_score and score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        return chevron.render(template, html_params).strip()

    elif data["panel"] == "submission":
        # No need to escape the raw_submitted_answer,
        # this gets done automatically by mustache
        html_params = {
            "submission": True,
            "type": bigo_type,
            "parse_error": parse_error,
            "uuid": pl.get_uuid(),
            display.value: True,
            "error": parse_error or missing_input,
            "a_sub": a_sub,
            "raw_submitted_answer": raw_submitted_answer,
            "missing_input": missing_input,
        }

        if show_score and score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value
            html_params["feedback"] = (
                data["partial_scores"].get(name, {}).get("feedback")
            )

        return chevron.render(template, html_params).strip()

    # Display the correct answer.
    elif data["panel"] == "answer":
        a_tru = data["correct_answers"].get(name)

        if a_tru is None:
            return ""

        if a_tru != "":
            a_tru = psu.convert_string_to_sympy(
                a_tru, variables, allow_complex=False, allow_trig_functions=False
            )
        html_params = {
            "answer": True,
            "a_tru": sympy.latex(a_tru),
            "type": bigo_type,
        }

        return chevron.render(template, html_params).strip()

    assert_never(data["panel"])


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    variables = psu.get_items_list(
        pl.get_string_attrib(element, "variable", VARIABLES_DEFAULT)
    )
    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    blank_value = pl.get_string_attrib(element, "blank-value", BLANK_VALUE_DEFAULT)

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data["submitted_answers"].get(name)
    if allow_blank and a_sub is not None and a_sub.strip() == "":
        a_sub = blank_value.strip()
        if a_sub == "":
            data["submitted_answers"][name] = a_sub
            return
    if a_sub is None:
        data["format_errors"][name] = "No submitted answer."
        data["submitted_answers"][name] = None
        return

    s = psu.validate_string_as_sympy(
        a_sub, variables, allow_complex=False, allow_trig_functions=False
    )

    if s is None:
        data["submitted_answers"][name] = a_sub
    else:
        data["format_errors"][name] = s
        data["submitted_answers"][name] = None


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    variables = psu.get_items_list(
        pl.get_string_attrib(element, "variable", VARIABLES_DEFAULT)
    )
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    a_tru: str | None = data["correct_answers"].get(name)

    # No need to grade if no correct answer given
    if a_tru is None:
        return

    big_o_type = pl.get_enum_attrib(element, "type", BigOType, BIG_O_TYPE_DEFAULT)

    try:
        pl.grade_answer_parameterized(
            data,
            name,
            lambda a_sub: GRADE_FUNCTION_DICT[big_o_type](a_tru, a_sub, variables),
            weight=weight,
            timeout=SYMPY_TIMEOUT,
            timeout_format_error="Your answer did not converge, so your expression may be too loose or tight.",
        )
    except ValueError as e:
        # See https://github.com/PrairieLearn/PrairieLearn/pull/13178 for more context as to why we catch this error.
        if "integer string conversion" in str(e):
            data["format_errors"][name] = (
                f"Your expression expands integers longer than {get_int_max_str_digits()} digits, "
                "try a simpler expression."
            )
        else:
            raise


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    result = data["test_type"]
    a_tru = None

    if result in ["correct", "incorrect"] and name not in data["correct_answers"]:
        # This element cannot test itself. Defer the generation of test inputs to server.py
        return
    elif result in ["correct", "incorrect"]:
        # Get raw correct answer
        a_tru = data["correct_answers"][name]

    if result == "correct":
        data["raw_submitted_answers"][name] = a_tru
        data["partial_scores"][name] = {
            "score": 1,
            "weight": weight,
            "feedback": bou.CORRECT_UNCONDITIONAL_FEEDBACK,
        }

    elif result == "incorrect" and a_tru == "":
        data["raw_submitted_answers"][name] = f"{random.randint(4, 100):d} * 1"
        data["partial_scores"][name] = {
            "score": 0,
            "weight": weight,
            "feedback": bou.INCORRECT_FEEDBACK,
        }
    elif result == "incorrect":
        data["raw_submitted_answers"][name] = f"{random.randint(4, 100):d} * {a_tru}"
        bigo_type = pl.get_enum_attrib(element, "type", BigOType, BIG_O_TYPE_DEFAULT)

        if bigo_type is BigOType.THETA:
            data["partial_scores"][name] = {
                "score": 0.25,
                "weight": weight,
                "feedback": bou.THETA_CONSTANT_FACTORS_FEEDBACK,
            }
        else:
            data["partial_scores"][name] = {
                "score": 0.5,
                "weight": weight,
                "feedback": bou.CONSTANT_FACTORS_FEEDBACK,
            }

    elif result == "invalid":
        invalid_answer = random.choice([
            "n + 1.234",
            "1 and 0",
            "tan(n)",
            "n + m",
            "n +* 1",
            "n + 1\\n",
            "n # some text",
        ])

        # TODO add detailed format errors if this gets checked in the future
        data["raw_submitted_answers"][name] = invalid_answer
        data["format_errors"][name] = ""

    else:
        assert_never(result)
