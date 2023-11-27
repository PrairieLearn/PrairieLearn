import random
from enum import Enum
from typing import Any

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
    correct_answer = pl.from_json(data["correct_answers"].get(name, None))
    if correct_answer is not None:
        # Get format and comparison parameters
        custom_format = pl.get_string_attrib(element, "custom-format", None)
        comparison = pl.get_enum_attrib(
            element, "comparison", ComparisonType, COMPARISON_DEFAULT
        )

        if custom_format is not None:
            correct_answer = ("{:" + custom_format + "}").format(correct_answer)
        elif comparison is ComparisonType.RELABS:
            # FIXME: render correctly with respect to rtol and atol
            correct_answer = "{:.12g}".format(correct_answer)
        elif comparison is ComparisonType.SIGFIG:
            digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
            correct_answer = pl.string_from_number_sigfig(correct_answer, digits=digits)
        elif comparison is ComparisonType.DECDIG:
            digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
            correct_answer = "{:.{ndigits}f}".format(correct_answer, ndigits=digits)
        else:
            assert_never(comparison)
    return correct_answer


def get_string_precision(number_string: str) -> float:
    if "." in number_string:
        return 10 ** -len(number_string.partition(".")[2])

    return 10 ** (len(number_string) - len(number_string.rstrip("0")))


def get_string_significant_digits(number_string: str) -> int:
    if "." in number_string:
        number_string_partition = number_string.partition(".")
        integer_part = len(number_string_partition[0].lstrip("0"))
        decimal_part = len(number_string_partition[2].lstrip("0"))
        return integer_part + decimal_part

    return len(number_string.strip("0"))


def get_string_decimal_digits(number_string: str) -> int:
    if "." in number_string:
        number_string_partition = number_string.partition(".")
        decimal_part = len(number_string_partition[2].lstrip("0"))
        return decimal_part
    return 0  # no decimal seperator means there are no decimal digits


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
    show_correct_answer = pl.get_boolean_attrib(
        element, "show-correct-answer", SHOW_CORRECT_ANSWER_DEFAULT
    )
    show_help_text = pl.get_boolean_attrib(
        element, "show-help-text", SHOW_HELP_TEXT_DEFAULT
    )
    raw_submitted_answer = data["raw_submitted_answers"].get(name)
    partial_score = data["partial_scores"].get(name, {"score": None})
    score = partial_score.get("score", None)
    with open(NUMBER_INPUT_MUSTACHE_TEMPLATE_NAME, "r", encoding="utf-8") as f:
        template = f.read()

    if data["panel"] == "question":
        editable = data["editable"]
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
            "raw_submitted_answer": raw_submitted_answer,
        }

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
        info_params["show_info"] = show_help_text
        info_params["allow_fractions"] = allow_fractions

        # Find the true answer to be able to display it in the info popup
        if show_correct_answer:
            html_params["correct_answer"] = format_true_ans(element, data, name)

        html_params["info"] = chevron.render(template, info_params).strip()

        # Within mustache, the shortformat generates the placeholder that is used as a placeholder inside of the numeric entry.
        # Here we opt to not generate the value, hence the placeholder is empty.
        # The placeholder text may be overriden by setting the 'placeholder' attribute in the pl-number-input HTML tag
        if pl.has_attrib(element, "placeholder"):
            # 'placeholder' attribute is set, override the placeholder text
            html_params["placeholder"] = pl.get_string_attrib(element, "placeholder")
        else:
            info_params.pop("format", None)
            # 'placeholder' attribute not set, use default shortformat as placeholder text
            info_params["shortformat"] = pl.get_boolean_attrib(
                element, "show-placeholder", SHOW_PLACEHOLDER_DEFAULT
            )
            html_params["placeholder"] = chevron.render(template, info_params).strip()

        # Determine the title of the popup based on what information is being shown
        html_params["popup_title"] = "Number" if show_help_text else "Correct Answer"

        # Enable or disable the popup
        if show_help_text:
            html_params["show_info"] = True

        return chevron.render(template, html_params).strip()

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
            submitted_answer = data["submitted_answers"].get(name)
            # If answer is in a format generated by pl.to_json, convert it
            # back to a standard type (otherwise, do nothing)
            submitted_answer = pl.from_json(submitted_answer)

            html_params["suffix"] = suffix
            html_params["submitted_answer"] = ("{:" + custom_format + "}").format(
                submitted_answer
            )
        elif name not in data["submitted_answers"]:
            html_params["missing_input"] = True
            html_params["parse_error"] = None
        else:
            if raw_submitted_answer is not None:
                html_params["raw_submitted_answer"] = pl.escape_unicode_string(
                    raw_submitted_answer
                )
        # Add true answer to be able to display it in the submitted answer panel
        if show_correct_answer:
            html_params["correct_answer"] = format_true_ans(element, data, name)

        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        html_params["error"] = html_params["parse_error"] or html_params.get(
            "missing_input", False
        )

        html_params["feedback"] = partial_score.get("feedback", None)

        return chevron.render(template, html_params).strip()

    elif data["panel"] == "answer":
        if show_correct_answer:
            html_params = {
                "answer": True,
                "label": label,
                "suffix": suffix,
                "correct_answer": format_true_ans(element, data, name),
            }
            return chevron.render(template, html_params).strip()
        return ""

    assert_never(data["panel"])


def get_format_string(
    is_complex: bool = False,
    allow_fractions: bool = False,
    message: str | None = None,
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

    submitted_answer = data["submitted_answers"].get(name, None)
    if allow_blank and submitted_answer is not None and submitted_answer.strip() == "":
        submitted_answer = blank_value
    value, newdata = pl.string_fraction_to_number(
        submitted_answer, allow_fractions, allow_complex
    )

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
    correct_answer: Any = pl.from_json(data["correct_answers"].get(name))
    if correct_answer is None:
        return

    # Get method of comparison, with relabs as default
    comparison = pl.get_enum_attrib(
        element, "comparison", ComparisonType, COMPARISON_DEFAULT
    )

    def grade_function(
        submitted_answer: str | dict[str, Any]
    ) -> tuple[bool, str | None]:
        nonlocal correct_answer
        # If submitted answer is in a format generated by pl.to_json, convert it
        # back to a standard type (otherwise, do nothing)
        submitted_answer_parsed: Any = pl.from_json(submitted_answer)
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
        if np.iscomplexobj(submitted_answer_parsed) or np.iscomplexobj(correct_answer):
            submitted_answer_converted = np.complex128(submitted_answer_parsed)
            correct_answer_converted = np.complex128(correct_answer)
        else:
            submitted_answer_converted = np.float64(submitted_answer_parsed)
            correct_answer_converted = np.float64(correct_answer)

        # Compare submitted answer with true answer
        if comparison is ComparisonType.RELABS:
            rtol = pl.get_float_attrib(element, "rtol", RTOL_DEFAULT)
            atol = pl.get_float_attrib(element, "atol", ATOL_DEFAULT)

            submitted_answer_precision = get_string_precision(str(submitted_answer))
            is_correct = pl.is_correct_scalar_ra(
                submitted_answer_converted, correct_answer_converted, rtol, atol
            )
            if not is_correct and (submitted_answer_precision > rtol):
                feedback += ANSWER_INSUFFICIENT_PRECISION_WARNING

        elif comparison is ComparisonType.SIGFIG:
            digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)

            submitted_answer_precision = get_string_significant_digits(
                str(submitted_answer)
            )
            is_correct = pl.is_correct_scalar_sf(
                submitted_answer_converted, correct_answer_converted, digits
            )
            if not is_correct and (submitted_answer_precision < digits):
                feedback += ANSWER_INSUFFICIENT_PRECISION_WARNING
        elif comparison is ComparisonType.DECDIG:
            digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
            submitted_answer_precision = get_string_decimal_digits(
                str(submitted_answer)
            )
            is_correct = pl.is_correct_scalar_dd(
                submitted_answer_converted, correct_answer_converted, digits
            )
            if not is_correct and (submitted_answer_precision < digits):
                feedback += ANSWER_INSUFFICIENT_PRECISION_WARNING
        else:
            assert_never(comparison)

        if is_correct and pl.get_boolean_attrib(
            element, "show-correct-answer", SHOW_CORRECT_ANSWER_DEFAULT
        ):
            feedback += (
                f"The correct answer used for grading was {correct_answer_converted}"
            )
        return (is_correct, feedback)

    pl.grade_answer_parameterized(data, name, grade_function, weight=weight)


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    # Get correct answer
    correct_answer = data["correct_answers"][name]

    # If correct answer is in a format generated by pl.to_json, convert it
    # back to a standard type (otherwise, do nothing)
    correct_answer = pl.from_json(correct_answer)
    correct_answer_converted = np.float64(correct_answer)

    result = data["test_type"]
    if result == "correct":
        data["raw_submitted_answers"][name] = str(correct_answer)
        data["partial_scores"][name] = {
            "score": 1,
            "weight": weight,
            "feedback": f"The correct answer used for grading was {correct_answer_converted}",
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
            eps = np.absolute(correct_answer) * rtol + atol
            eps += random.uniform(1, 10)
            answer = correct_answer + eps * random.choice([-1, 1])
        elif comparison is ComparisonType.SIGFIG:
            digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
            # Get max error according to pl.is_correct_scalar_sf()
            if correct_answer == 0:
                n = digits - 1
            else:
                n = -int(np.floor(np.log10(np.abs(correct_answer)))) + (digits - 1)
            eps = 0.51 * (10**-n)
            eps += random.uniform(1, 10)
            answer = correct_answer + eps * random.choice([-1, 1])
        elif comparison is ComparisonType.DECDIG:
            digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
            # Get max error according to pl.is_correct_scalar_dd()
            eps = 0.51 * (10**-digits)
            eps += random.uniform(1, 10)
            answer = correct_answer + eps * random.choice([-1, 1])
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
