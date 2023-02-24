import random
from enum import Enum
from html import escape
from typing import Dict, Optional

import big_o_utils as bou
import chevron
import lxml.html
import prairielearn as pl
import python_helper_sympy as phs
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


GRADE_FUNCTION_DICT: Dict[BigOType, bou.BigOGradingFunctionT] = {
    BigOType.BIG_O: bou.grade_o_expression,
    BigOType.THETA: bou.grade_theta_expression,
    BigOType.OMEGA: bou.grade_omega_expression,
    BigOType.LITTLE_O: bou.grade_o_expression,
    BigOType.LITTLE_OMEGA: bou.grade_omega_expression,
}

VARIABLES_DEFAULT = ""
SIZE_DEFAULT = 35
SHOW_HELP_TEXT_DEFAULT = True
WEIGHT_DEFAULT = 1
DISPLAY_DEFAULT = DisplayType.INLINE
BIG_O_TYPE_DEFAULT = BigOType.BIG_O
PLACEHOLDER_DEFAULT = "asymptotic expression"
BIG_O_INPUT_MUSTACHE_TEMPLATE_NAME = "pl-big-o-input.mustache"


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["answers-name"]
    optional_attribs = [
        "weight",
        "correct-answer",
        "variable",
        "size",
        "display",
        "show-help-text",
        "type",
        "placeholder",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)

    name = pl.get_string_attrib(element, "answers-name")
    variables = phs.get_variables_list(
        pl.get_string_attrib(element, "variable", VARIABLES_DEFAULT)
    )

    if len(variables) > 1:
        raise ValueError(f"Only one variable is supported for question {name}")

    if pl.has_attrib(element, "correct-answer"):
        if name in data["correct_answers"]:
            raise ValueError(f"duplicate correct_answers variable name: {name}")

        a_true = pl.get_string_attrib(element, "correct-answer")
        # Validate that the answer can be parsed before storing
        try:
            phs.convert_string_to_sympy(
                a_true, variables, allow_complex=False, allow_trig_functions=False
            )
        except phs.BaseSympyError:
            raise ValueError(f"Parsing correct answer {a_true} for {name} failed")

        data["correct_answers"][name] = a_true


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    variables = phs.get_variables_list(
        pl.get_string_attrib(element, "variable", VARIABLES_DEFAULT)
    )
    display = pl.get_enum_attrib(element, "display", DisplayType, DISPLAY_DEFAULT)
    size = pl.get_integer_attrib(element, "size", SIZE_DEFAULT)

    bigo_type = pl.get_enum_attrib(element, "type", BigOType, BIG_O_TYPE_DEFAULT).value
    placeholder = pl.get_string_attrib(element, "placeholder", PLACEHOLDER_DEFAULT)

    constants_class = phs._Constants()

    operators = ["( )", "+", "-", "*", "/", "^", "**"]
    operators.extend(variables)
    operators.extend(constants_class.functions.keys())

    constants = list(constants_class.variables.keys())

    info_params = {
        "format": True,
        "variable": variables,
        "operators": operators,
        "constants": constants,
    }

    score = data["partial_scores"].get(name, {}).get("score")

    if data["panel"] == "question":
        editable = data["editable"]
        raw_submitted_answer = data["raw_submitted_answers"].get(name)

        with open(BIG_O_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
            info = chevron.render(f, info_params).strip()

        if raw_submitted_answer is not None:
            raw_submitted_answer = escape(raw_submitted_answer)

        html_params = {
            "question": True,
            "name": name,
            "editable": editable,
            "info": info,
            "size": size,
            "show_info": pl.get_boolean_attrib(
                element, "show-help-text", SHOW_HELP_TEXT_DEFAULT
            ),
            "uuid": pl.get_uuid(),
            display.value: True,
            "placeholder": placeholder,
            "raw_submitted_answer": raw_submitted_answer,
            "type": bigo_type,
        }

        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        with open(BIG_O_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    elif data["panel"] == "submission":
        parse_error: Optional[str] = data["format_errors"].get(name)
        missing_input = False
        feedback = None
        a_sub = None
        raw_submitted_answer = None

        if parse_error is None and name in data["submitted_answers"]:
            a_sub = sympy.latex(
                sympy.sympify(data["submitted_answers"][name], evaluate=False)
            )
            if name in data["partial_scores"]:
                feedback = data["partial_scores"][name].get("feedback")
        elif name not in data["submitted_answers"]:
            missing_input = True
            parse_error = None
        else:
            # Use the existing format text in the invalid popup.
            with open(BIG_O_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
                info = chevron.render(f, info_params).strip()

            # Render invalid popup
            raw_submitted_answer = data["raw_submitted_answers"].get(name)
            if isinstance(parse_error, str):
                with open(
                    BIG_O_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8"
                ) as f:
                    parse_error += chevron.render(
                        f, {"format_error": True, "format_string": info}
                    ).strip()
            if raw_submitted_answer is not None:
                raw_submitted_answer = pl.escape_unicode_string(raw_submitted_answer)

        html_params = {
            "submission": True,
            "type": bigo_type,
            "parse_error": parse_error,
            "uuid": pl.get_uuid(),
            display.value: True,
            "error": parse_error or missing_input,
            "a_sub": a_sub,
            "feedback": feedback,
            "raw_submitted_answer": raw_submitted_answer,
        }

        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        with open(BIG_O_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    # Display the correct answer.
    elif data["panel"] == "answer":
        a_tru = data["correct_answers"].get(name)

        if a_tru is None:
            return ""

        a_tru = sympy.sympify(a_tru)
        html_params = {
            "answer": True,
            "a_tru": sympy.latex(a_tru),
            "type": bigo_type,
        }
        with open(BIG_O_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    assert_never(data["panel"])


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    variables = phs.get_variables_list(
        pl.get_string_attrib(element, "variable", VARIABLES_DEFAULT)
    )

    a_sub = data["submitted_answers"].get(name)
    if a_sub is None:
        data["format_errors"][name] = "No submitted answer."
        data["submitted_answers"][name] = None
        return

    a_proccessed = phs.process_student_input(a_sub)

    s = phs.validate_string_as_sympy(
        a_proccessed, variables, allow_complex=False, allow_trig_functions=False
    )

    if s is None:
        data["submitted_answers"][name] = a_proccessed
    else:
        data["format_errors"][name] = s
        data["submitted_answers"][name] = None


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    variables = phs.get_variables_list(
        pl.get_string_attrib(element, "variable", VARIABLES_DEFAULT)
    )
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    a_tru: Optional[str] = data["correct_answers"].get(name)

    # No need to grade if no correct answer given
    if a_tru is None:
        return

    big_o_type = pl.get_enum_attrib(element, "type", BigOType, BIG_O_TYPE_DEFAULT)

    pl.grade_answer_parameterized(
        data,
        name,
        lambda a_sub: GRADE_FUNCTION_DICT[big_o_type](a_tru, a_sub, variables),
        weight=weight,
    )


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    # Get raw correct answer
    a_tru = data["correct_answers"][name]

    result = data["test_type"]
    if result == "correct":
        data["raw_submitted_answers"][name] = a_tru
        data["partial_scores"][name] = {
            "score": 1,
            "weight": weight,
            "feedback": bou.CORRECT_UNCONDITIONAL_FEEDBACK,
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
        invalid_answer = random.choice(
            [
                "n + 1.234",
                "1 and 0",
                "tan(n)",
                "n + m",
                "n +* 1",
                "n + 1\\n",
                "n # some text",
            ]
        )

        # TODO add detailed format errors if this gets checked in the future
        data["raw_submitted_answers"][name] = invalid_answer
        data["format_errors"][name] = ""

    else:
        assert_never(result)
