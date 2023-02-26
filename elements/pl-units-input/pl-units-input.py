from enum import Enum
from html import escape
from typing import Optional

import chevron
import lxml.html
import prairielearn as pl
import unit_utils as uu
from pint import Quantity, Unit, errors
from typing_extensions import assert_never


class DisplayType(Enum):
    INLINE = "inline"
    BLOCK = "block"


class GradingMode(Enum):
    ONLY_UNITS = 1
    EXACT_UNITS = 2
    WITH_UNITS = 3


GRADING_MODE_DEFAULT = GradingMode.WITH_UNITS
WEIGHT_DEFAULT = 1
CORRECT_ANSWER_DEFAULT = None
LABEL_DEFAULT = None
SUFFIX_DEFAULT = None
DISPLAY_DEFAULT = DisplayType.INLINE
ALLOW_BLANK_DEFAULT = False
COMPARISON_DEFAULT = uu.ComparisonType.RELABS
RTOL_DEFAULT = 1e-2
ATOL_DEFAULT = "1e-8"
DIGITS_DEFAULT = 2
SIZE_DEFAULT = 35
SHOW_HELP_TEXT_DEFAULT = True
MAGNITUDE_PARTIAL_CREDIT_DEFAULT = None
ALLOW_FEEDBACK_DEFAULT = True

UNITS_INPUT_MUSTACHE_TEMPLATE_NAME = "pl-units-input.mustache"


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["answers-name"]
    optional_attribs = [
        "weight",
        "correct-answer",
        "label",
        "suffix",
        "display",
        "allow-blank",
        "blank-value",
        "grading-mode",
        "comparison",
        "rtol",
        "atol",
        "digits",
        "size",
        "show-help-text",
        "placeholder",
        "magnitude-partial-credit",
        "allow-feedback",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)

    allow_blank = pl.get_string_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    if allow_blank and not pl.has_attrib(element, "blank-value"):
        raise ValueError(
            'Attribute "blank-value" must be provided if "allow-blank" is enabled.'
        )

    name = pl.get_string_attrib(element, "answers-name")
    correct_answer_html = pl.get_string_attrib(
        element, "correct-answer", CORRECT_ANSWER_DEFAULT
    )

    if correct_answer_html is not None:
        if name in data["correct_answers"]:
            raise ValueError(f"Duplicate correct_answers variable name: {name}")
        data["correct_answers"][name] = correct_answer_html

    correct_answer = data["correct_answers"].get(name)

    digits = pl.get_integer_attrib(element, "digits", None)
    if digits is not None and digits <= 0:
        raise ValueError(
            f"Number of digits specified must be at least 1, not {digits}."
        )

    atol = pl.get_string_attrib(element, "atol", ATOL_DEFAULT)
    ureg = pl.get_unit_registry()
    parsed_atol = ureg.Quantity(atol)

    grading_mode = pl.get_enum_attrib(
        element, "grading-mode", GradingMode, GRADING_MODE_DEFAULT
    )

    # In units agnostic mode, absolute tolerance must have units. Otherwise just a float
    if grading_mode is GradingMode.WITH_UNITS:
        if not pl.has_attrib(element, "atol"):
            raise ValueError("atol is a required parameter for units agnostic grading.")

        if parsed_atol.dimensionless:
            raise ValueError(
                f'atol parameter "{atol}" must have units in unit agnostic grading.'
            )

        if pl.has_attrib(element, "comparison"):
            raise ValueError(
                'Cannot set parameter "comparison" in unit agnostic grading.'
            )

        if pl.has_attrib(element, "rtol"):
            raise ValueError('Cannot set parameter "rtol" in unit agnostic grading.')

        partial_credit = pl.get_float_attrib(
            element, "magnitude-partial-credit", MAGNITUDE_PARTIAL_CREDIT_DEFAULT
        )

        if partial_credit is not None and not (0.0 <= partial_credit <= 1.0):
            raise ValueError(
                f'"magnitude-partial-credit" must be in the range [0.0, 1.0], not {partial_credit}'
            )

        correct_answer_parsed = ureg.Quantity(correct_answer)

        if (correct_answer_parsed is not None) and (
            not correct_answer_parsed.check(parsed_atol.dimensionality)
        ):
            raise ValueError(
                f"Correct answer has dimensionality: {correct_answer_parsed.dimensionality}, "
                f"which does not match atol dimensionality: {parsed_atol.dimensionality}."
            )
    else:
        if not parsed_atol.dimensionless:
            raise ValueError(
                f'atol parameter "{atol}" may only have units in units agnostic grading.'
            )


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    label = pl.get_string_attrib(element, "label", LABEL_DEFAULT)
    suffix = pl.get_string_attrib(element, "suffix", SUFFIX_DEFAULT)
    display = pl.get_enum_attrib(element, "display", DisplayType, DISPLAY_DEFAULT)
    size = pl.get_integer_attrib(element, "size", SIZE_DEFAULT)
    comparison = pl.get_enum_attrib(
        element, "comparison", uu.ComparisonType, COMPARISON_DEFAULT
    )
    grading_mode = pl.get_enum_attrib(
        element, "grading-mode", GradingMode, GRADING_MODE_DEFAULT
    )
    show_info = pl.get_boolean_attrib(element, "show-help-text", SHOW_HELP_TEXT_DEFAULT)
    digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)

    custom_format = pl.get_string_attrib(element, "custom-format", None)

    raw_submitted_answer = data["raw_submitted_answers"].get(name, None)
    partial_scores = data["partial_scores"].get(name, {})
    score = partial_scores.get("score")

    ureg = pl.get_unit_registry()

    if data["panel"] == "question":
        editable = data["editable"]

        # Get info strings
        with open(UNITS_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
            info = chevron.render(
                f,
                {"format": True, "only_units": grading_mode is GradingMode.ONLY_UNITS},
            ).strip()

        if pl.has_attrib(element, "placeholder"):
            placeholder_text = pl.get_string_attrib(element, "placeholder")
        elif grading_mode is GradingMode.ONLY_UNITS:
            placeholder_text = "Unit"
        elif grading_mode is GradingMode.WITH_UNITS:
            atol = pl.get_string_attrib(element, "atol", ATOL_DEFAULT)
            placeholder_text = f"Number (atol={atol}) + Unit"

        elif grading_mode is GradingMode.EXACT_UNITS:
            if comparison is uu.ComparisonType.RELABS:
                rtol = pl.get_float_attrib(element, "rtol", RTOL_DEFAULT)
                atol = pl.get_string_attrib(element, "atol", ATOL_DEFAULT)
                placeholder_text = f"Number (rtol={rtol}, atol={atol}) + Unit"
            elif comparison is uu.ComparisonType.EXACT:
                placeholder_text = "Number (exact) + Unit"
            elif comparison is uu.ComparisonType.SIGFIG:
                figure_str = "figure" if digits == 1 else "figures"
                placeholder_text = f"Number ({digits} significant {figure_str}) + Unit"
            elif comparison is uu.ComparisonType.DECDIG:
                digit_str = "digit" if digits == 1 else "digits"
                placeholder_text = f"Number ({digits} {digit_str} after decimal) + Unit"
            else:
                assert_never(comparison)
        else:
            assert_never(grading_mode)

        html_params = {
            "question": True,
            "name": name,
            "label": label,
            "suffix": suffix,
            "editable": editable,
            "info": info,
            "size": size,
            "show_info": show_info,
            "placeholder": placeholder_text,
            "uuid": pl.get_uuid(),
            display.value: True,
            "display_append_span": show_info or suffix,
        }

        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        if raw_submitted_answer is not None:
            html_params["raw_submitted_answer"] = escape(raw_submitted_answer)

        with open(UNITS_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    elif data["panel"] == "submission":
        parse_error = data["format_errors"].get(name, None)
        html_params = {
            "submission": True,
            "label": label,
            "parse_error": parse_error,
            "uuid": pl.get_uuid(),
        }

        if parse_error is None and name in data["submitted_answers"]:
            a_sub = data["submitted_answers"].get(name, None)
            if a_sub is None:
                raise ValueError("submitted answer is None")

            a_sub_parsed = ureg.Quantity(a_sub)
            html_params["a_sub"] = prepare_display_string(
                a_sub_parsed, custom_format, grading_mode
            )
            html_params["suffix"] = suffix
            html_params["raw_submitted_answer"] = raw_submitted_answer

        elif name not in data["submitted_answers"]:
            html_params["missing_input"] = True
            html_params["parse_error"] = None

        else:
            submitted_answer = data["raw_submitted_answers"].get(name, None)
            if submitted_answer is not None:
                html_params["raw_submitted_answer"] = pl.escape_unicode_string(
                    submitted_answer
                )

        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        feedback = partial_scores.get("feedback")
        allow_feedback = pl.get_boolean_attrib(
            element, "allow-feedback", ALLOW_FEEDBACK_DEFAULT
        )
        if feedback is not None and allow_feedback:
            html_params["feedback"] = feedback

        html_params["error"] = html_params["parse_error"] or html_params.get(
            "missing_input", False
        )
        with open(UNITS_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    elif data["panel"] == "answer":
        a_tru = data["correct_answers"].get(name, None)

        if a_tru is None:
            return ""

        a_tru_parsed = ureg.Quantity(a_tru)

        html_params = {
            "answer": True,
            "label": label,
            "a_tru": prepare_display_string(a_tru_parsed, custom_format, grading_mode),
            "suffix": suffix,
        }
        with open(UNITS_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    assert_never(data["panel"])


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    allow_blank = pl.get_string_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)

    only_units = (
        pl.get_enum_attrib(element, "grading-mode", GradingMode, GRADING_MODE_DEFAULT)
        is GradingMode.ONLY_UNITS
    )

    # retrieves submitted answer
    a_sub = data["submitted_answers"].get(name, None)
    if a_sub is None:
        data["format_errors"][name] = "No submitted answer."
        data["submitted_answers"][name] = None
        return

    # checks for blank answer
    if not a_sub:
        if allow_blank:
            data["submitted_answers"][name] = pl.get_string_attrib(
                element, "blank-value"
            )
        else:
            data["format_errors"][
                name
            ] = "Invalid format. The submitted answer was left blank."
            data["submitted_answers"][name] = None

        return

    ureg = pl.get_unit_registry()

    # checks for invalids by parsing as a dimensionful quantity
    try:
        a_sub_parsed = ureg.Quantity(a_sub)
    except errors.UndefinedUnitError:  # incorrect units
        data["format_errors"][name] = "Invalid unit."
        return
    except Exception as e:
        data["format_errors"][name] = f"Exception when parsing submission: {e}"
        return

    # Checks for no unit in submitted answer, all answers require units
    if a_sub_parsed.dimensionless:
        data["format_errors"][
            name
        ] = "Invalid format. The submitted answer has no unit."
        data["submitted_answers"][name] = None
        return

    # checks for no number in submitted answer
    numberless = uu.is_numberless(a_sub, a_sub_parsed)

    if numberless and not only_units:
        data["format_errors"][
            name
        ] = "Invalid format. The submitted answer should include a magnitude."
        data["submitted_answers"][name] = None
        return

    if only_units and not numberless:
        data["format_errors"][
            name
        ] = "Invalid format. The submitted answer should not include a magnitude."
        data["submitted_answers"][name] = None
        return

    # Convert submitted answer to full names
    if only_units:
        data["submitted_answers"][name] = str(a_sub_parsed.units)
    else:
        data["submitted_answers"][name] = str(a_sub_parsed)


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    grading_mode = pl.get_enum_attrib(
        element, "grading-mode", GradingMode, GRADING_MODE_DEFAULT
    )

    a_tru = data["correct_answers"].get(name, None)
    if a_tru is None:
        return

    # Store cache on system. Needed to prevent slow grading / parsing times
    # due to object creation
    ureg = pl.get_unit_registry()

    if grading_mode is GradingMode.ONLY_UNITS:
        grading_fn = uu.get_only_units_grading_fn(ureg=ureg, correct_ans=a_tru)
    elif grading_mode is GradingMode.EXACT_UNITS:
        grading_fn = uu.get_exact_units_grading_fn(
            ureg=ureg,
            correct_ans=a_tru,
            comparison=pl.get_enum_attrib(
                element, "comparison", uu.ComparisonType, COMPARISON_DEFAULT
            ),
            magnitude_partial_credit=pl.get_float_attrib(
                element, "magnitude-partial-credit", MAGNITUDE_PARTIAL_CREDIT_DEFAULT
            ),
            digits=pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT),
            rtol=pl.get_float_attrib(element, "rtol", RTOL_DEFAULT),
            atol=pl.get_string_attrib(element, "atol", ATOL_DEFAULT),
        )
    elif grading_mode is GradingMode.WITH_UNITS:
        grading_fn = uu.get_with_units_grading_fn(
            ureg=ureg,
            correct_ans=a_tru,
            atol=pl.get_string_attrib(element, "atol"),  # No default in this case.
        )
    else:
        assert_never(grading_mode)

    pl.grade_answer_parameterized(data, name, grading_fn, weight)


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    a_tru = data["correct_answers"][name]
    grading_mode = pl.get_enum_attrib(
        element, "grading-mode", GradingMode, GRADING_MODE_DEFAULT
    )

    result = data["test_type"]
    if result == "correct":
        if grading_mode is GradingMode.ONLY_UNITS:
            data["raw_submitted_answers"][name] = str(Unit(a_tru))
        else:
            data["raw_submitted_answers"][name] = a_tru

        data["partial_scores"][name] = {"score": 1, "weight": weight}
    elif result == "incorrect":
        # TODO Possibly add other test cases
        ureg = pl.get_unit_registry()
        if grading_mode is GradingMode.ONLY_UNITS:
            answer = str((ureg.Quantity(a_tru) * ureg.meters).units)
            partial_score = 0.0
            feedback = uu.INCORRECT_FEEDBACK
        elif grading_mode is GradingMode.EXACT_UNITS:
            answer = ureg.Quantity(a_tru) * 2

            partial_credit = pl.get_float_attrib(
                element, "magnitude-partial-credit", MAGNITUDE_PARTIAL_CREDIT_DEFAULT
            )

            partial_score = 1.0 - partial_credit if partial_credit is not None else 0.0
            feedback = uu.CORRECT_UNITS_INCORRECT_MAGNITUDE_FEEDBACK
        elif grading_mode is GradingMode.WITH_UNITS:
            answer = ureg.Quantity(a_tru) * 2
            partial_score = 0.0
            feedback = uu.INCORRECT_FEEDBACK
        else:
            assert_never(grading_mode)

        data["partial_scores"][name] = {
            "score": partial_score,
            "weight": weight,
            "feedback": feedback,
        }

        data["raw_submitted_answers"][name] = str(answer)
    elif result == "invalid":
        data["raw_submitted_answers"][name] = "1 vfg"
        data["format_errors"][name] = "Invalid unit."
    else:
        assert_never(result)


def prepare_display_string(
    quantity: Quantity, custom_format: Optional[str], grading_mode: GradingMode
) -> str:
    if grading_mode is GradingMode.ONLY_UNITS:
        return str(quantity.units)
    elif custom_format is None:
        return str(quantity)

    # Display reference solution with the given custom format
    return f"{quantity:{custom_format}}"
