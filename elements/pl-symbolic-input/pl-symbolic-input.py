import random
from enum import Enum
from html import escape
from typing import Tuple, Union

import chevron
import lxml.html
import prairielearn as pl
import python_helper_sympy as phs
import sympy
from typing_extensions import assert_never


class DisplayType(Enum):
    INLINE = "inline"
    BLOCK = "block"


WEIGHT_DEFAULT = 1
CORRECT_ANSWER_DEFAULT = None
VARIABLES_DEFAULT = None
LABEL_DEFAULT = None
DISPLAY_DEFAULT = DisplayType.INLINE
ALLOW_COMPLEX_DEFAULT = False
IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT = "i"
SIZE_DEFAULT = 35
SHOW_HELP_TEXT_DEFAULT = True
ALLOW_BLANK_DEFAULT = False
BLANK_VALUE_DEFAULT = "0"
PLACEHOLDER_DEFAULT = "symbolic expression"
SYMBOLIC_INPUT_MUSTACHE_TEMPLATE_NAME = "pl-symbolic-input.mustache"


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["answers-name"]
    optional_attribs = [
        "weight",
        "correct-answer",
        "variables",
        "label",
        "display",
        "allow-complex",
        "imaginary-unit-for-display",
        "size",
        "show-help-text",
        "allow-blank",
        "blank-value",
        "placeholder",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, "answers-name")

    correct_answer = pl.get_string_attrib(
        element, "correct-answer", CORRECT_ANSWER_DEFAULT
    )
    if correct_answer is not None:
        if name in data["correct_answers"]:
            raise ValueError(f"Duplicate correct_answers variable name: {name}")
        data["correct_answers"][name] = correct_answer

    imaginary_unit = pl.get_string_attrib(
        element, "imaginary-unit-for-display", IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT
    )
    if imaginary_unit not in {"i", "j"}:
        raise ValueError("imaginary-unit-for-display must be either i or j")


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    label = pl.get_string_attrib(element, "label", LABEL_DEFAULT)
    variables_string = pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    variables = phs.get_variables_list(variables_string)
    display = pl.get_enum_attrib(element, "display", DisplayType, DISPLAY_DEFAULT)
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )
    imaginary_unit = pl.get_string_attrib(
        element, "imaginary-unit-for-display", IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT
    )
    size = pl.get_integer_attrib(element, "size", SIZE_DEFAULT)
    placeholder = pl.get_string_attrib(element, "placeholder", PLACEHOLDER_DEFAULT)

    constants_class = phs._Constants()
    operators = ["( )", "+", "-", "*", "/", "^", "**"]

    operators.extend(constants_class.functions.keys())
    operators.extend(constants_class.trig_functions.keys())

    constants = list(constants_class.variables.keys())

    if data["panel"] == "question":
        editable = data["editable"]
        raw_submitted_answer = data["raw_submitted_answers"].get(name, None)

        info_params = {
            "format": True,
            "variables": variables,
            "operators": operators,
            "constants": constants,
            "allow_complex": allow_complex,
        }
        with open(SYMBOLIC_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
            info = chevron.render(f, info_params).strip()

        html_params = {
            "question": True,
            "name": name,
            "label": label,
            "editable": editable,
            "info": info,
            "placeholder": placeholder,
            "size": size,
            "show_info": pl.get_boolean_attrib(
                element, "show-help-text", SHOW_HELP_TEXT_DEFAULT
            ),
            "uuid": pl.get_uuid(),
            "allow_complex": allow_complex,
        }

        score = data["partial_scores"].get(name, {"score": None}).get("score", None)

        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        html_params[display.value] = True

        if raw_submitted_answer is not None:
            html_params["raw_submitted_answer"] = escape(raw_submitted_answer)

        with open(SYMBOLIC_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    elif data["panel"] == "submission":
        parse_error = data["format_errors"].get(name, None)

        html_params = {
            "submission": True,
            "label": label,
            "parse_error": parse_error,
            "uuid": pl.get_uuid(),
        }
        if parse_error is None:
            a_sub = data["submitted_answers"].get(name)
            if a_sub is not None:
                if isinstance(a_sub, str):
                    # this is for backward-compatibility
                    a_sub = phs.convert_string_to_sympy(
                        a_sub, variables, allow_complex=allow_complex
                    )
                else:
                    a_sub = phs.json_to_sympy(a_sub, allow_complex=allow_complex)
                a_sub = a_sub.subs(sympy.I, sympy.Symbol(imaginary_unit))
                html_params["a_sub"] = sympy.latex(a_sub)
            else:
                html_params["missing_input"] = True
                html_params["parse_error"] = None
        else:
            # Use the existing format text in the invalid popup.
            info_params = {
                "format": True,
                "variables": variables,
                "operators": operators,
                "constants": constants,
                "allow_complex": allow_complex,
            }
            with open(
                SYMBOLIC_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8"
            ) as f:
                info = chevron.render(f, info_params).strip()

            # Render invalid popup
            raw_submitted_answer = data["raw_submitted_answers"].get(name, None)
            with open(
                SYMBOLIC_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8"
            ) as f:
                parse_error += chevron.render(
                    f, {"format_error": True, "format_string": info}
                ).strip()

            html_params["parse_error"] = parse_error
            if raw_submitted_answer is not None:
                html_params["raw_submitted_answer"] = pl.escape_unicode_string(
                    raw_submitted_answer
                )

        score = data["partial_scores"].get(name, {"score": None}).get("score", None)

        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        html_params[display.value] = True

        html_params["error"] = html_params["parse_error"] or html_params.get(
            "missing_input", False
        )

        with open(SYMBOLIC_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    elif data["panel"] == "answer":
        a_tru = data["correct_answers"].get(name)
        if a_tru is not None:
            if isinstance(a_tru, str):
                # this is so instructors can specify the true answer simply as a string
                a_tru = phs.convert_string_to_sympy(
                    a_tru, variables, allow_complex=allow_complex
                )
            else:
                a_tru = phs.json_to_sympy(a_tru, allow_complex=allow_complex)
            a_tru = a_tru.subs(sympy.I, sympy.Symbol(imaginary_unit))
            html_params = {"answer": True, "label": label, "a_tru": sympy.latex(a_tru)}
            with open(
                SYMBOLIC_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8"
            ) as f:
                return chevron.render(f, html_params).strip()
        else:
            return ""

    assert_never(data["panel"])


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    variables = phs.get_variables_list(
        pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    )
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )
    imaginary_unit = pl.get_string_attrib(
        element, "imaginary-unit-for-display", IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT
    )
    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    blank_value = pl.get_string_attrib(element, "blank-value", str(BLANK_VALUE_DEFAULT))

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data["submitted_answers"].get(name, None)
    if allow_blank and a_sub is not None and a_sub.strip() == "":
        a_sub = blank_value
    if not a_sub:
        data["format_errors"][name] = "No submitted answer."
        data["submitted_answers"][name] = None
        return

    a_proccessed = phs.process_student_input(a_sub)

    error_msg = phs.validate_string_as_sympy(
        a_proccessed,
        variables,
        allow_complex=allow_complex,
        allow_trig_functions=True,
        imaginary_unit=imaginary_unit,
    )

    if error_msg is not None:
        data["format_errors"][name] = error_msg
        data["submitted_answers"][name] = None
        return

    a_sub_parsed = phs.convert_string_to_sympy(
        a_proccessed,
        variables,
        allow_hidden=True,
        allow_complex=allow_complex,
        allow_trig_functions=True,
    )

    # Make sure we can parse the json again
    try:
        a_sub_json = phs.sympy_to_json(a_sub_parsed, allow_complex=allow_complex)

        # Convert safely to sympy
        phs.json_to_sympy(a_sub_json, allow_complex=allow_complex)

        # Finally, store the result
        data["submitted_answers"][name] = a_sub_json
    except Exception:
        data["format_errors"][
            name
        ] = f"Your answer was simplified to this, which contains an invalid expression: $${sympy.latex(a_sub_parsed):s}$$"
        data["submitted_answers"][name] = None


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    variables = phs.get_variables_list(
        pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    )
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = data["correct_answers"].get(name, None)
    if a_tru is None:
        return

    # Parse true answer
    if isinstance(a_tru, str):
        # this is so instructors can specify the true answer simply as a string
        a_tru_sympy = phs.convert_string_to_sympy(
            a_tru, variables, allow_complex=allow_complex
        )
    else:
        a_tru_sympy = phs.json_to_sympy(a_tru, allow_complex=allow_complex)

    def grade_function(a_sub: Union[str, phs.SympyJson]) -> Tuple[bool, None]:
        # Parse submitted answer
        if isinstance(a_sub, str):
            # this is for backward-compatibility
            a_sub_sympy = phs.convert_string_to_sympy(
                a_sub, variables, allow_complex=allow_complex, allow_trig_functions=True
            )
        else:
            a_sub_sympy = phs.json_to_sympy(
                a_sub, allow_complex=allow_complex, allow_trig_functions=True
            )

        return a_tru_sympy.equals(a_sub_sympy) is True, None

    pl.grade_answer_parameterized(data, name, grade_function, weight=weight)


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    variables = phs.get_variables_list(
        pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    )
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    imaginary_unit = pl.get_string_attrib(
        element, "imaginary-unit-for-display", IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT
    )

    # Get raw correct answer
    a_tru = data["correct_answers"][name]

    # Parse correct answer based on type
    if isinstance(a_tru, str):
        a_tru = phs.convert_string_to_sympy(
            a_tru, variables, allow_complex=allow_complex
        )
    else:
        a_tru = phs.json_to_sympy(a_tru, allow_complex=allow_complex)

    # Substitute in imaginary unit symbol
    a_tru_str = str(a_tru.subs(sympy.I, sympy.Symbol(imaginary_unit)))

    result = data["test_type"]
    if result == "correct":
        data["raw_submitted_answers"][name] = a_tru_str
        data["partial_scores"][name] = {"score": 1, "weight": weight}

    elif result == "incorrect":
        data["raw_submitted_answers"][
            name
        ] = f"{a_tru_str} + {random.randint(1, 100):d}"
        data["partial_scores"][name] = {"score": 0, "weight": weight}

    elif result == "invalid":
        invalid_answer = random.choice(
            [
                "n + 1.234",
                "x + (1+2j)",
                "1 and 0",
                "aatan(n)",
                "x + y",
                "x +* 1",
                "x + 1\\n",
                "x # some text",
            ]
        )

        # TODO add back detailed format errors if this gets checked in the future
        data["raw_submitted_answers"][name] = invalid_answer
        data["format_errors"][name] = ""
    else:
        assert_never(result)
