import random
from enum import Enum

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
VARIABLES_DEFAULT = None
CUSTOM_FUNCTIONS_DEFAULT = None
LABEL_DEFAULT = None
SUFFIX_DEFAULT = None
DISPLAY_DEFAULT = DisplayType.INLINE
ALLOW_COMPLEX_DEFAULT = False
IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT = "i"
ALLOW_TRIG_FUNCTIONS_DEFAULT = True
SIZE_DEFAULT = 35
SHOW_HELP_TEXT_DEFAULT = True
ALLOW_BLANK_DEFAULT = False
BLANK_VALUE_DEFAULT = "0"
PLACEHOLDER_DEFAULT = "symbolic expression"
SHOW_SCORE_DEFAULT = True
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
        "allow-trig-functions",
        "size",
        "show-help-text",
        "allow-blank",
        "blank-value",
        "placeholder",
        "custom-functions",
        "show-score",
        "suffix",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, "answers-name")
    pl.check_answers_names(data, name)

    if pl.has_attrib(element, "correct-answer"):
        if name in data["correct_answers"]:
            raise ValueError(f"duplicate correct_answers variable name: {name}")

        a_true = pl.get_string_attrib(element, "correct-answer")
        variables = phs.get_items_list(
            pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
        )
        custom_functions = phs.get_items_list(
            pl.get_string_attrib(element, "custom-functions", CUSTOM_FUNCTIONS_DEFAULT)
        )
        allow_complex = pl.get_boolean_attrib(
            element, "allow-complex", ALLOW_COMPLEX_DEFAULT
        )
        allow_trig = pl.get_boolean_attrib(
            element, "allow-trig-functions", ALLOW_TRIG_FUNCTIONS_DEFAULT
        )
        # Validate that the answer can be parsed before storing
        try:
            phs.convert_string_to_sympy(
                a_true,
                variables,
                allow_complex=allow_complex,
                allow_trig_functions=allow_trig,
                custom_functions=custom_functions,
            )
        except phs.BaseSympyError:
            raise ValueError(f'Parsing correct answer "{a_true}" for "{name}" failed.')

        data["correct_answers"][name] = a_true

    imaginary_unit = pl.get_string_attrib(
        element, "imaginary-unit-for-display", IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT
    )
    if imaginary_unit not in {"i", "j"}:
        raise ValueError("imaginary-unit-for-display must be either i or j")


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    label = pl.get_string_attrib(element, "label", LABEL_DEFAULT)
    suffix = pl.get_string_attrib(element, "suffix", SUFFIX_DEFAULT)
    variables = phs.get_items_list(
        pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    )
    custom_functions = phs.get_items_list(
        pl.get_string_attrib(element, "custom-functions", CUSTOM_FUNCTIONS_DEFAULT)
    )
    display = pl.get_enum_attrib(element, "display", DisplayType, DISPLAY_DEFAULT)
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )
    imaginary_unit = pl.get_string_attrib(
        element, "imaginary-unit-for-display", IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT
    )
    allow_trig = pl.get_boolean_attrib(
        element, "allow-trig-functions", ALLOW_TRIG_FUNCTIONS_DEFAULT
    )
    size = pl.get_integer_attrib(element, "size", SIZE_DEFAULT)
    placeholder = pl.get_string_attrib(element, "placeholder", PLACEHOLDER_DEFAULT)
    show_score = pl.get_boolean_attrib(element, "show-score", SHOW_SCORE_DEFAULT)
    show_info = pl.get_boolean_attrib(element, "show-help-text", SHOW_HELP_TEXT_DEFAULT)

    constants_class = phs._Constants()

    operators: list[str] = list(phs.STANDARD_OPERATORS)
    operators.extend(custom_functions)
    operators.extend(constants_class.functions.keys())
    if allow_trig:
        operators.extend(constants_class.trig_functions.keys())

    constants = list(constants_class.variables.keys())

    info_params = {
        "format": True,
        "variables": variables,
        "operators": operators,
        "constants": constants,
        "allow_complex": allow_complex,
    }

    with open(SYMBOLIC_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
        template = f.read()

    info = chevron.render(template, info_params).strip()

    parse_error: str | None = data["format_errors"].get(name)
    missing_input = False
    a_sub_converted = None

    if parse_error is None and name in data["submitted_answers"]:
        a_sub = data["submitted_answers"][name]

        if isinstance(a_sub, str):
            # this is for backward-compatibility
            a_sub_parsed = phs.convert_string_to_sympy(
                a_sub,
                variables,
                allow_complex=allow_complex,
                custom_functions=custom_functions,
                allow_trig_functions=allow_trig,
            )
        else:
            a_sub_parsed = phs.json_to_sympy(
                a_sub, allow_complex=allow_complex, allow_trig_functions=allow_trig
            )
        a_sub_converted = sympy.latex(
            a_sub_parsed.subs(sympy.I, sympy.Symbol(imaginary_unit))
        )
    elif name not in data["submitted_answers"]:
        missing_input = True
        parse_error = None
    else:
        # Use the existing format text in the invalid popup and render it
        if parse_error is not None:
            parse_error += chevron.render(
                template, {"format_error": True, "format_string": info}
            ).strip()

    # Next, get some attributes we will use in multiple places
    raw_submitted_answer = data["raw_submitted_answers"].get(name)
    score = data["partial_scores"].get(name, {}).get("score")

    if data["panel"] == "question":
        editable = data["editable"]

        html_params = {
            "question": True,
            "name": name,
            "label": label,
            "suffix": suffix,
            "editable": editable,
            "info": info,
            "placeholder": placeholder,
            "size": size,
            "show_info": show_info,
            "uuid": pl.get_uuid(),
            "allow_complex": allow_complex,
            "raw_submitted_answer": raw_submitted_answer,
            "parse_error": parse_error,
            display.value: True,
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
            "a_sub": a_sub_converted,
            "raw_submitted_answer": raw_submitted_answer,
            display.value: True,
            "error": parse_error or missing_input,
        }

        if show_score and score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        return chevron.render(template, html_params).strip()

    elif data["panel"] == "answer":
        a_tru = data["correct_answers"].get(name)
        if a_tru is None:
            return ""

        elif isinstance(a_tru, str):
            # this is so instructors can specify the true answer simply as a string
            a_tru = phs.convert_string_to_sympy(
                a_tru,
                variables,
                allow_complex=allow_complex,
                allow_trig_functions=allow_trig,
                custom_functions=custom_functions,
            )
        else:
            a_tru = phs.json_to_sympy(
                a_tru, allow_complex=allow_complex, allow_trig_functions=allow_trig
            )

        a_tru = a_tru.subs(sympy.I, sympy.Symbol(imaginary_unit))
        html_params = {
            "answer": True,
            "label": label,
            "suffix": suffix,
            "a_tru": sympy.latex(a_tru),
        }
        return chevron.render(template, html_params).strip()

    assert_never(data["panel"])


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    variables = phs.get_items_list(
        pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    )
    custom_functions = phs.get_items_list(
        pl.get_string_attrib(element, "custom-functions", CUSTOM_FUNCTIONS_DEFAULT)
    )
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )
    imaginary_unit = pl.get_string_attrib(
        element, "imaginary-unit-for-display", IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT
    )
    allow_trig = pl.get_boolean_attrib(
        element, "allow-trig-functions", ALLOW_TRIG_FUNCTIONS_DEFAULT
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

    error_msg = phs.validate_string_as_sympy(
        a_sub,
        variables,
        allow_complex=allow_complex,
        allow_trig_functions=allow_trig,
        imaginary_unit=imaginary_unit,
        custom_functions=custom_functions,
    )

    if error_msg is not None:
        data["format_errors"][name] = error_msg
        data["submitted_answers"][name] = None
        return

    # Retrieve variable assumptions encoded in correct answer
    assumptions_dict = None
    a_tru = data["correct_answers"].get(name, {})
    if isinstance(a_tru, dict):
        assumptions_dict = a_tru.get("_assumptions")

    a_sub_parsed = phs.convert_string_to_sympy(
        a_sub,
        variables,
        allow_hidden=True,
        allow_complex=allow_complex,
        allow_trig_functions=allow_trig,
        assumptions=assumptions_dict,
        custom_functions=custom_functions,
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
    variables = phs.get_items_list(
        pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    )
    custom_functions = phs.get_items_list(
        pl.get_string_attrib(element, "custom-functions", CUSTOM_FUNCTIONS_DEFAULT)
    )
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )
    allow_trig = pl.get_boolean_attrib(
        element, "allow-trig-functions", ALLOW_TRIG_FUNCTIONS_DEFAULT
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
            a_tru,
            variables,
            allow_complex=allow_complex,
            allow_trig_functions=allow_trig,
            custom_functions=custom_functions,
        )
    else:
        a_tru_sympy = phs.json_to_sympy(a_tru, allow_complex=allow_complex)

    def grade_function(a_sub: str | phs.SympyJson) -> tuple[bool, None]:
        # Parse submitted answer
        if isinstance(a_sub, str):
            # this is for backward-compatibility
            a_sub_sympy = phs.convert_string_to_sympy(
                a_sub,
                variables,
                allow_complex=allow_complex,
                allow_trig_functions=allow_trig,
                custom_functions=custom_functions,
                assumptions=a_tru_sympy.assumptions0,
            )
        else:
            a_sub_sympy = phs.json_to_sympy(
                a_sub, allow_complex=allow_complex, allow_trig_functions=allow_trig
            )

        return a_tru_sympy.equals(a_sub_sympy) is True, None

    pl.grade_answer_parameterized(data, name, grade_function, weight=weight)


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    variables = phs.get_items_list(
        pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    )
    custom_functions = phs.get_items_list(
        pl.get_string_attrib(element, "custom-functions", CUSTOM_FUNCTIONS_DEFAULT)
    )
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    imaginary_unit = pl.get_string_attrib(
        element, "imaginary-unit-for-display", IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT
    )
    allow_trig = pl.get_boolean_attrib(
        element, "allow-trig-functions", ALLOW_TRIG_FUNCTIONS_DEFAULT
    )

    # Get raw correct answer
    a_tru = data["correct_answers"][name]

    # Parse correct answer based on type
    if isinstance(a_tru, str):
        a_tru = phs.convert_string_to_sympy(
            a_tru,
            variables,
            allow_complex=allow_complex,
            allow_trig_functions=allow_trig,
            custom_functions=custom_functions,
        )
    else:
        a_tru = phs.json_to_sympy(
            a_tru, allow_complex=allow_complex, allow_trig_functions=allow_trig
        )

    # Substitute in imaginary unit symbol
    a_tru_str = str(a_tru.subs(sympy.I, sympy.Symbol(imaginary_unit)))

    result = data["test_type"]
    if result == "correct":
        correct_answers = [
            a_tru_str,
            f"{a_tru_str} + 0",
        ]
        if allow_complex:
            correct_answers.append(f"2j + {a_tru_str} - 3j + j")
        if allow_trig:
            correct_answers.append(f"cos(0) * ( {a_tru_str} )")

        data["raw_submitted_answers"][name] = random.choice(correct_answers)
        data["partial_scores"][name] = {"score": 1, "weight": weight}

    elif result == "incorrect":
        data["raw_submitted_answers"][
            name
        ] = f"{a_tru_str} + {random.randint(1, 100):d}"
        data["partial_scores"][name] = {"score": 0, "weight": weight}

    elif result == "invalid":
        invalid_answers = [
            "n + 1.234",
            "x + (1+2j)",
            "1 and 0",
            "aatan(n)",
            "x + y",
            "x +* 1",
            "x + 1\\n",
            "x # some text",
        ]
        if not allow_complex:
            invalid_answers.append("3j")
        if not allow_trig:
            invalid_answers.append("cos(2)")

        # TODO add back detailed format errors if this gets checked in the future
        data["raw_submitted_answers"][name] = random.choice(invalid_answers)
        data["format_errors"][name] = ""
    else:
        assert_never(result)
