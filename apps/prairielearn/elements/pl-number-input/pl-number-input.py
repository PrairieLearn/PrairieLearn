import random
from enum import Enum
from html import escape
from typing import Any, Optional

import chevron
import lxml.html
import numpy as np
import prairielearn as pl
from typing_extensions import assert_never


class DisplayType(Enum):
    INLINE = "inline"
    BLOCK = "block"


class ComparisonType(Enum):
    RELABS = "relabs"
    SIGFIG = "sigfig"
    DECDIG = "decdig"


RTOL_DEFAULT = 1e-2
ATOL_DEFAULT = 1e-8
SIZE_DEFAULT = 35
DIGITS_DEFAULT = 2
WEIGHT_DEFAULT = 1
DISPLAY_DEFAULT = DisplayType.INLINE
COMPARISON_DEFAULT = ComparisonType.RELABS
ALLOW_COMPLEX_DEFAULT = False
SHOW_HELP_TEXT_DEFAULT = True
SHOW_PLACEHOLDER_DEFAULT = True
SHOW_CORRECT_ANSWER_DEFAULT = True
ALLOW_FRACTIONS_DEFAULT = True
ALLOW_BLANK_DEFAULT = False
BLANK_VALUE_DEFAULT = 0
CUSTOM_FORMAT_DEFAULT = ".12g"
SHOW_SCORE_DEFAULT = True
ANSWER_INSUFFICIENT_PRECISION_WARNING = (
    "Your answer does not have precision within the specified relative tolerance."
)

NUMBER_INPUT_MUSTACHE_TEMPLATE_NAME = "pl-number-input.mustache"


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["answers-name"]
    optional_attribs = [
        "weight",
        "correct-answer",
        "label",
        "suffix",
        "display",
        "comparison",
        "rtol",
        "atol",
        "digits",
        "allow-complex",
        "show-help-text",
        "size",
        "show-correct-answer",
        "show-placeholder",
        "allow-fractions",
        "allow-blank",
        "blank-value",
        "custom-format",
        "placeholder",
        "show-score",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, "answers-name")
    pl.check_answers_names(data, name)

    correct_answer = pl.get_float_attrib(element, "correct-answer", None)
    if correct_answer is not None:
        if name in data["correct_answers"]:
            raise Exception("duplicate correct_answers variable name: %s" % name)
        data["correct_answers"][name] = correct_answer

    custom_format = pl.get_string_attrib(element, "custom-format", None)
    if custom_format is not None:
        try:
            _ = ("{:" + custom_format + "}").format(0)
        except ValueError:
            raise Exception("invalid custom format: %s" % custom_format) from None


def format_true_ans(
    element: lxml.html.HtmlElement, data: pl.QuestionData, name: str
) -> str:
    a_tru = pl.from_json(data["correct_answers"].get(name, None))
    if a_tru is not None:
        # Get format and comparison parameters
        custom_format = pl.get_string_attrib(element, "custom-format", None)
        comparison = pl.get_enum_attrib(
            element, "comparison", ComparisonType, COMPARISON_DEFAULT
        )

        if custom_format is not None:
            a_tru = ("{:" + custom_format + "}").format(a_tru)
        elif comparison is ComparisonType.RELABS:
            # FIXME: render correctly with respect to rtol and atol
            a_tru = "{:.12g}".format(a_tru)
        elif comparison is ComparisonType.SIGFIG:
            digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
            a_tru = pl.string_from_number_sigfig(a_tru, digits=digits)
        elif comparison is ComparisonType.DECDIG:
            digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
            a_tru = "{:.{ndigits}f}".format(a_tru, ndigits=digits)
        else:
            assert_never(comparison)
    return a_tru


def get_string_precision(number_string: str) -> float:
    if "." in number_string:
        return 10 ** -len(number_string.partition(".")[2])

    return 10 ** (len(number_string) - len(number_string.rstrip("0")))


# TODO: add precision calculation function for other grading methods


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    label = pl.get_string_attrib(element, "label", None)
    suffix = pl.get_string_attrib(element, "suffix", None)
    display = pl.get_enum_attrib(element, "display", DisplayType, DISPLAY_DEFAULT)
    allow_fractions = pl.get_boolean_attrib(
        element, "allow-fractions", ALLOW_FRACTIONS_DEFAULT
    )
    custom_format = pl.get_string_attrib(
        element, "custom-format", CUSTOM_FORMAT_DEFAULT
    )
    show_score = pl.get_boolean_attrib(element, "show-score", SHOW_SCORE_DEFAULT)

    if data["panel"] == "question":
        editable = data["editable"]
        raw_submitted_answer = data["raw_submitted_answers"].get(name, None)
        parse_error = data["format_errors"].get(name, None)

        html_params = {
            "question": True,
            "name": name,
            "label": label,
            "suffix": suffix,
            "editable": editable,
            "size": pl.get_integer_attrib(element, "size", SIZE_DEFAULT),
            "uuid": pl.get_uuid(),
            "show_score": show_score,
            "parse_error": parse_error,
            display.value: True,
        }

        partial_score = data["partial_scores"].get(name, {"score": None})
        score = partial_score.get("score", None)
        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        # Get comparison parameters and info strings
        comparison = pl.get_enum_attrib(
            element, "comparison", ComparisonType, COMPARISON_DEFAULT
        )

        if comparison is ComparisonType.RELABS:
            rtol = pl.get_float_attrib(element, "rtol", RTOL_DEFAULT)
            atol = pl.get_float_attrib(element, "atol", ATOL_DEFAULT)
            if rtol < 0:
                raise ValueError(
                    "Attribute rtol = {:g} must be non-negative".format(rtol)
                )
            if atol < 0:
                raise ValueError(
                    "Attribute atol = {:g} must be non-negative".format(atol)
                )
            info_params = {
                "format": True,
                "relabs": True,
                "rtol": "{:g}".format(rtol),
                "atol": "{:g}".format(atol),
            }
        elif comparison is ComparisonType.SIGFIG:
            digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
            if digits < 0:
                raise ValueError(
                    "Attribute digits = {:d} must be non-negative".format(digits)
                )
            info_params = {
                "format": True,
                "sigfig": True,
                "digits": "{:d}".format(digits),
                "comparison_eps": 0.51 * (10 ** -(digits - 1)),
                "digits_plural": digits > 1,
            }
        elif comparison is ComparisonType.DECDIG:
            digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
            if digits < 0:
                raise ValueError(
                    "Attribute digits = {:d} must be non-negative".format(digits)
                )
            info_params = {
                "format": True,
                "decdig": True,
                "digits": "{:d}".format(digits),
                "comparison_eps": 0.51 * (10 ** -(digits - 0)),
                "digits_plural": digits > 1,
            }
        else:
            assert_never(comparison)

        # Update parameters for the info popup
        info_params["allow_complex"] = pl.get_boolean_attrib(
            element, "allow-complex", ALLOW_COMPLEX_DEFAULT
        )
        info_params["show_info"] = pl.get_boolean_attrib(
            element, "show-help-text", SHOW_HELP_TEXT_DEFAULT
        )
        info_params["allow_fractions"] = allow_fractions

        # Find the true answer to be able to display it in the info popup
        ans_true = None
        if pl.get_boolean_attrib(
            element, "show-correct-answer", SHOW_CORRECT_ANSWER_DEFAULT
        ):
            ans_true = format_true_ans(element, data, name)
        if ans_true is not None:
            info_params["a_tru"] = ans_true

        with open(NUMBER_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
            info = chevron.render(f, info_params).strip()
        with open(NUMBER_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
            info_params.pop("format", None)
            # Within mustache, the shortformat generates the placeholder that is used as a placeholder inside of the numeric entry.
            # Here we opt to not generate the value, hence the placeholder is empty.
            # The placeholder text may be overriden by setting the 'placeholder' attribute in the pl-number-input HTML tag
            if pl.has_attrib(element, "placeholder"):
                # 'placeholder' attribute is set, override the placeholder text
                html_params["placeholder"] = pl.get_string_attrib(
                    element, "placeholder"
                )
            else:
                # 'placeholder' attribute not set, use default shortformat as placeholder text
                info_params["shortformat"] = pl.get_boolean_attrib(
                    element, "show-placeholder", SHOW_PLACEHOLDER_DEFAULT
                )
                html_params["placeholder"] = chevron.render(f, info_params).strip()

        html_params["info"] = info

        # Determine the title of the popup based on what information is being shown
        if pl.get_boolean_attrib(element, "show-help-text", SHOW_HELP_TEXT_DEFAULT):
            html_params["popup_title"] = "Number"
        else:
            html_params["popup_title"] = "Correct Answer"

        # Enable or disable the popup
        if pl.get_boolean_attrib(element, "show-help-text", SHOW_HELP_TEXT_DEFAULT):
            html_params["show_info"] = True

        if raw_submitted_answer is not None:
            html_params["raw_submitted_answer"] = escape(raw_submitted_answer)
        with open(NUMBER_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    elif data["panel"] == "submission":
        parse_error = data["format_errors"].get(name, None)
        html_params = {
            "submission": True,
            "label": label,
            "parse_error": parse_error,
            "uuid": pl.get_uuid(),
            "show_score": show_score,
        }

        if parse_error is None and name in data["submitted_answers"]:
            a_sub = data["submitted_answers"].get(name)
            # If answer is in a format generated by pl.to_json, convert it
            # back to a standard type (otherwise, do nothing)
            a_sub = pl.from_json(a_sub)

            html_params["suffix"] = suffix
            html_params["a_sub"] = ("{:" + custom_format + "}").format(a_sub)
        elif name not in data["submitted_answers"]:
            html_params["missing_input"] = True
            html_params["parse_error"] = None
        else:
            raw_submitted_answer = data["raw_submitted_answers"].get(name, None)
            if raw_submitted_answer is not None:
                html_params["raw_submitted_answer"] = pl.escape_unicode_string(
                    raw_submitted_answer
                )
        # Add true answer to be able to display it in the submitted answer panel
        ans_true = None
        if pl.get_boolean_attrib(
            element, "show-correct-answer", SHOW_CORRECT_ANSWER_DEFAULT
        ):
            ans_true = format_true_ans(element, data, name)
        if ans_true is not None:
            html_params["a_tru"] = ans_true

        partial_score = data["partial_scores"].get(name, {"score": None})
        score = partial_score.get("score", None)

        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        html_params["error"] = html_params["parse_error"] or html_params.get(
            "missing_input", False
        )

        html_params["feedback"] = partial_score.get("feedback", None)

        with open(NUMBER_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    elif data["panel"] == "answer":
        ans_true = None
        if pl.get_boolean_attrib(
            element, "show-correct-answer", SHOW_CORRECT_ANSWER_DEFAULT
        ):
            ans_true = format_true_ans(element, data, name)

        if ans_true is None:
            return ""

        html_params = {
            "answer": True,
            "label": label,
            "a_tru": ans_true,
            "suffix": suffix,
        }
        with open(NUMBER_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    assert_never(data["panel"])


def get_format_string(
    is_complex: bool = False,
    allow_fractions: bool = False,
    message: Optional[str] = None,
) -> str:
    params = {
        "complex": is_complex,
        "format_error": True,
        "allow_fractions": allow_fractions,
        "format_error_message": message,
    }
    with open(NUMBER_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
        return chevron.render(f, params).strip()


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )
    allow_fractions = pl.get_boolean_attrib(
        element, "allow-fractions", ALLOW_FRACTIONS_DEFAULT
    )
    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    blank_value = pl.get_string_attrib(element, "blank-value", str(BLANK_VALUE_DEFAULT))

    a_sub = data["submitted_answers"].get(name, None)
    if allow_blank and a_sub is not None and a_sub.strip() == "":
        a_sub = blank_value
    value, newdata = pl.string_fraction_to_number(a_sub, allow_fractions, allow_complex)

    if value is not None:
        data["submitted_answers"][name] = newdata["submitted_answers"]
    else:
        data["format_errors"][name] = get_format_string(
            allow_complex, allow_fractions, newdata["format_errors"]
        )
        data["submitted_answers"][name] = None


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")

    # Get weight
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru: Any = pl.from_json(data["correct_answers"].get(name))
    if a_tru is None:
        return

    # Get method of comparison, with relabs as default
    comparison = pl.get_enum_attrib(
        element, "comparison", ComparisonType, COMPARISON_DEFAULT
    )

    def grade_function(a_sub: str | dict[str, Any]) -> tuple[bool, Optional[str]]:
        nonlocal a_tru
        # If submitted answer is in a format generated by pl.to_json, convert it
        # back to a standard type (otherwise, do nothing)
        a_sub_parsed: Any = pl.from_json(a_sub)
        feedback = ""
        is_correct = None

        # Cast both submitted and true answers as np.float64, because...
        #
        #   If the method of comparison is relabs (i.e., using relative and
        #   absolute tolerance) then np.allclose is applied to check if the
        #   submitted and true answers are the same. If either answer is an
        #   integer outside the range of int64...
        #
        #       https://docs.scipy.org/doc/numpy-1.13.0/user/basics.types.html
        #
        #   ...then numpy throws this error:
        #
        #       TypeError: ufunc 'isfinite' not supported for the input types, and
        #       the inputs could not be safely coerced to any supported types
        #       according to the casting rule ''safe''
        #
        #   Casting as np.float64 avoids this error. This is reasonable in any case,
        #   because <pl-number-input> accepts double-precision floats, not ints.
        #
        if np.iscomplexobj(a_sub_parsed) or np.iscomplexobj(a_tru):
            a_sub_converted = np.complex128(a_sub_parsed)
            a_tru_converted = np.complex128(a_tru)
        else:
            a_sub_converted = np.float64(a_sub_parsed)
            a_tru_converted = np.float64(a_tru)

        # Compare submitted answer with true answer
        if comparison is ComparisonType.RELABS:
            rtol = pl.get_float_attrib(element, "rtol", RTOL_DEFAULT)
            atol = pl.get_float_attrib(element, "atol", ATOL_DEFAULT)

            a_sub_precision = get_string_precision(str(a_sub))
            is_correct = pl.is_correct_scalar_ra(
                a_sub_converted, a_tru_converted, rtol, atol
            )
            if not is_correct and (a_sub_precision > rtol):
                feedback += ANSWER_INSUFFICIENT_PRECISION_WARNING

        elif comparison is ComparisonType.SIGFIG:
            digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
            is_correct = pl.is_correct_scalar_sf(
                a_sub_converted, a_tru_converted, digits
            )
        elif comparison is ComparisonType.DECDIG:
            digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
            is_correct = pl.is_correct_scalar_dd(
                a_sub_converted, a_tru_converted, digits
            )
        else:
            assert_never(comparison)

        if is_correct and pl.get_boolean_attrib(
            element, "show-correct-answer", SHOW_CORRECT_ANSWER_DEFAULT
        ):
            feedback += f"The correct answer used for grading was {a_tru_converted}"
        return (is_correct, feedback)

    pl.grade_answer_parameterized(data, name, grade_function, weight=weight)


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    # Get correct answer
    a_tru = data["correct_answers"][name]

    # If correct answer is in a format generated by pl.to_json, convert it
    # back to a standard type (otherwise, do nothing)
    a_tru = pl.from_json(a_tru)
    a_tru_converted = np.float64(a_tru)

    result = data["test_type"]
    if result == "correct":
        data["raw_submitted_answers"][name] = str(a_tru)
        data["partial_scores"][name] = {
            "score": 1,
            "weight": weight,
            "feedback": f"The correct answer used for grading was {a_tru_converted}",
        }
    elif result == "incorrect":
        data["partial_scores"][name] = {"score": 0, "weight": weight}
        # Get method of comparison, with relabs as default
        comparison = pl.get_enum_attrib(
            element, "comparison", ComparisonType, COMPARISON_DEFAULT
        )

        if comparison is ComparisonType.RELABS:
            rtol = pl.get_float_attrib(element, "rtol", RTOL_DEFAULT)
            atol = pl.get_float_attrib(element, "atol", ATOL_DEFAULT)
            # Get max error according to numpy.allclose()
            eps = np.absolute(a_tru) * rtol + atol
            eps += random.uniform(1, 10)
            answer = a_tru + eps * random.choice([-1, 1])
        elif comparison is ComparisonType.SIGFIG:
            digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
            # Get max error according to pl.is_correct_scalar_sf()
            if a_tru == 0:
                n = digits - 1
            else:
                n = -int(np.floor(np.log10(np.abs(a_tru)))) + (digits - 1)
            eps = 0.51 * (10**-n)
            eps += random.uniform(1, 10)
            answer = a_tru + eps * random.choice([-1, 1])
        elif comparison is ComparisonType.DECDIG:
            digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
            # Get max error according to pl.is_correct_scalar_dd()
            eps = 0.51 * (10**-digits)
            eps += random.uniform(1, 10)
            answer = a_tru + eps * random.choice([-1, 1])
        else:
            assert_never(comparison)

        data["raw_submitted_answers"][name] = str(answer)
    elif result == "invalid":
        # FIXME: add more invalid expressions, make text of format_errors
        # correct, and randomize
        data["raw_submitted_answers"][name] = "1 + 2"
        data["format_errors"][name] = "invalid"
    else:
        assert_never(result)
