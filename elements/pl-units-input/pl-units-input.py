from enum import Enum
from html import escape

import chevron
import lxml.html
import prairielearn as pl
import unit_utils as uu
from pint import Unit, UnitRegistry, errors
from typing_extensions import assert_never


class DisplayType(Enum):
    INLINE = "inline"
    BLOCK = "block"


class GradingMode(Enum):
    UNITS_ONLY = 1
    UNITS_FIXED = 2
    UNITS_AGNOSTIC = 3


GRADING_MODE_DEFAULT = GradingMode.UNITS_FIXED
WEIGHT_DEFAULT = 1
CORRECT_ANSWER_DEFAULT = None
LABEL_DEFAULT = None
SUFFIX_DEFAULT = None
DISPLAY_DEFAULT = DisplayType.INLINE
ALLOW_BLANK_DEFAULT = False
BLANK_VALUE_DEFAULT = ""
COMPARISON_DEFAULT = uu.ComparisonType.RELABS
RTOL_DEFAULT = 1e-2
ATOL_DEFAULT = "1e-8"
DIGITS_DEFAULT = 2
SIZE_DEFAULT = 35
SHOW_HELP_TEXT_DEFAULT = True
MAGNITUDE_PARTIAL_CREDIT_DEFAULT = None
SHOW_FEEDBACK_DEFAULT = True

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
        "show-feedback",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)

    name = pl.get_string_attrib(element, "answers-name")
    correct_answer_html = pl.get_string_attrib(
        element, "correct-answer", CORRECT_ANSWER_DEFAULT
    )

    if correct_answer_html is not None:
        # TODO possibly transform correct answers to cannonical unit names?
        if name in data["correct_answers"]:
            raise ValueError("Duplicate correct_answers variable name: {name}")
        data["correct_answers"][name] = correct_answer_html

    ureg = UnitRegistry(cache_folder=":auto:")
    correct_answer = data["correct_answers"].get(name)
    correct_answer_parsed = None

    grading_mode = pl.get_enum_attrib(
        element, "grading-mode", GradingMode, GRADING_MODE_DEFAULT
    )

    if correct_answer is not None:
        # Attempt to parse the correct answer to make sure it can be parsed later by the grader.
        # if parsing succeeds, save the parsed version.
        # TODO maybe save this in params as something just for a display parameter? Not sure if
        # this could cause confusing behavior.
        correct_answer_parsed = ureg.Quantity(correct_answer)

        if grading_mode is GradingMode.UNITS_ONLY:
            data["correct_answers"][name] = str(correct_answer_parsed.units)
        else:
            data["correct_answers"][name] = str(correct_answer_parsed)

    digits = pl.get_integer_attrib(element, "digits", None)
    if digits is not None and digits <= 0:
        raise ValueError(
            f"Number of digits specified must be at least 1, not {digits}."
        )

    atol = pl.get_string_attrib(element, "atol", ATOL_DEFAULT)
    parsed_atol = ureg.Quantity(atol)

    # In units agnostic mode, absolute tolerance must have units. Otherwise just a float
    if grading_mode is GradingMode.UNITS_AGNOSTIC:
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

    raw_submitted_answer = data["raw_submitted_answers"].get(name, None)
    partial_scores = data["partial_scores"].get(name, {})
    score = partial_scores.get("score")

    if data["panel"] == "question":
        editable = data["editable"]

        # Get info strings
        with open(UNITS_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
            info = chevron.render(
                f,
                {"format": True, "units_only": grading_mode is GradingMode.UNITS_ONLY},
            ).strip()

        if pl.has_attrib(element, "placeholder"):
            placeholder_text = pl.get_string_attrib(element, "placeholder")
        elif grading_mode is GradingMode.UNITS_ONLY:
            placeholder_text = "Unit"
        elif grading_mode is GradingMode.UNITS_AGNOSTIC:
            atol = pl.get_string_attrib(element, "atol", ATOL_DEFAULT)
            placeholder_text = f"Number (atol={atol}) + Unit"

        # Grading mode must be units fixed at this point,
        # now can case based on comparison
        elif comparison is uu.ComparisonType.RELABS:
            rtol = pl.get_float_attrib(element, "rtol", RTOL_DEFAULT)
            atol = pl.get_string_attrib(element, "atol", ATOL_DEFAULT)
            placeholder_text = f"Number (rtol={rtol}, atol={atol}) + Unit"
        elif comparison is uu.ComparisonType.EXACT:
            placeholder_text = "Number (exact) + Unit"
        elif comparison is uu.ComparisonType.SIGFIG:
            digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
            figure_str = "figure" if digits == 1 else "figures"
            placeholder_text = f"Number ({digits} significant {figure_str}) + Unit"
        elif comparison is uu.ComparisonType.DECDIG:
            digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
            digit_str = "digit" if digits == 1 else "digits"
            placeholder_text = f"Number ({digits} {digit_str} after decimal) + Unit"
        else:
            assert_never(comparison)

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
            # Get submitted answer, raising an exception if it does not exist
            a_sub = data["submitted_answers"].get(name, None)
            if a_sub is None:
                raise ValueError("submitted answer is None")

            html_params["suffix"] = suffix
            html_params["a_sub"] = a_sub
            html_params["raw_submitted_answer"] = raw_submitted_answer

        elif name not in data["submitted_answers"]:
            html_params["missing_input"] = True
            html_params["parse_error"] = None

        else:
            # Getting data from submitted answers means that
            submitted_answer = data["raw_submitted_answers"].get(name, None)
            if submitted_answer is not None:
                html_params["raw_submitted_answer"] = pl.escape_unicode_string(
                    submitted_answer
                )

        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        feedback = partial_scores.get("feedback")
        show_feedback = pl.get_boolean_attrib(
            element, "show-feedback", SHOW_FEEDBACK_DEFAULT
        )
        if feedback is not None and show_feedback:
            html_params["feedback"] = feedback

        html_params["error"] = html_params["parse_error"] or html_params.get(
            "missing_input", False
        )
        with open(UNITS_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    # TODO make this display consistent with number input (sigfigs and such)
    elif data["panel"] == "answer":
        a_tru = data["correct_answers"].get(name, None)

        if a_tru is None:
            return ""

        html_params = {"answer": True, "label": label, "a_tru": a_tru, "suffix": suffix}
        with open(UNITS_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    assert_never(data["panel"])


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    allow_blank = pl.get_string_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    blank_value = pl.get_string_attrib(element, "blank-value", BLANK_VALUE_DEFAULT)

    units_only = (
        pl.get_enum_attrib(element, "grading-mode", GradingMode, GRADING_MODE_DEFAULT)
        is GradingMode.UNITS_ONLY
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
            data["submitted_answers"][name] = blank_value
        else:
            data["format_errors"][
                name
            ] = "Invalid format. The submitted answer was left blank."
            data["submitted_answers"][name] = None

        return

    # TODO double check that doing this is ok. May need to switch to directory local to question / server
    ureg = UnitRegistry(cache_folder=":auto:")

    # checks for invalids by parsing as a dimensionful quantity
    # TODO check for more possible exceptions here?
    try:
        a_sub_parsed = ureg.Quantity(a_sub)
    except errors.UndefinedUnitError:  # incorrect units
        data["format_errors"][name] = "Invalid unit."
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

    if numberless and not units_only:
        data["format_errors"][
            name
        ] = "Invalid format. The submitted answer should include a magnitude."
        data["submitted_answers"][name] = None
        return

    if units_only and not numberless:
        data["format_errors"][
            name
        ] = "Invalid format. The submitted answer should not include a magnitude."
        data["submitted_answers"][name] = None
        return

    # Convert submitted answer to full names
    if units_only:
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
    ureg = UnitRegistry(cache_folder=":auto:")

    if grading_mode is GradingMode.UNITS_ONLY:
        grading_fn = uu.get_units_only_grading_fn(ureg=ureg, correct_ans=a_tru)
    elif grading_mode is GradingMode.UNITS_FIXED:
        grading_fn = uu.get_units_fixed_grading_fn(
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
    elif grading_mode is GradingMode.UNITS_AGNOSTIC:
        grading_fn = uu.get_units_agnostic_grading_fn(
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
        if grading_mode is GradingMode.UNITS_ONLY:
            data["raw_submitted_answers"][name] = str(Unit(a_tru))
        else:
            data["raw_submitted_answers"][name] = a_tru

        data["partial_scores"][name] = {"score": 1, "weight": weight}
    elif result == "incorrect":
        # TODO Possibly add other test cases
        ureg = UnitRegistry(cache_folder=":auto:")
        if grading_mode is GradingMode.UNITS_ONLY:
            answer = str((ureg.Quantity(a_tru) * ureg.meters).units)
            partial_score = 0.0
            feedback = uu.INCORRECT_FEEDBACK
        elif grading_mode is GradingMode.UNITS_FIXED:
            answer = ureg.Quantity(a_tru) * 2
            partial_score = 0.3
            feedback = uu.CORRECT_UNITS_INCORRECT_MAGNITUDE_FEEDBACK
        elif grading_mode is GradingMode.UNITS_AGNOSTIC:
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
