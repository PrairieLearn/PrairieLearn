import math
import random
from enum import Enum
from html import escape
from typing import Literal

import chevron
import lxml.html
import numpy as np
import prairielearn as pl
from sympy import Expr
from typing_extensions import assert_never


class ComparisonMode(Enum):
    RELABS = "relabs"
    SIGFIG = "sigfig"
    DECDIG = "decdig"


WEIGHT_DEFAULT = 1
LABEL_DEFAULT = None
COMPARISON_DEFAULT = ComparisonMode.RELABS
RTOL_DEFAULT = 1e-2
ATOL_DEFAULT = 1e-8
DIGITS_DEFAULT = 2
ALLOW_PARTIAL_CREDIT_DEFAULT = False
ALLOW_FRACTIONS_DEFAULT = True
ALLOW_BLANK_DEFAULT = False
BLANK_VALUE_DEFAULT = 0


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["answers-name"]
    optional_attribs = [
        "weight",
        "label",
        "comparison",
        "rtol",
        "atol",
        "digits",
        "allow-partial-credit",
        "allow-feedback",
        "allow-fractions",
        "rows",
        "columns",
        "allow-blank",
        "blank-value",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, "answers-name")
    pl.check_answers_names(data, name)

    if name not in data["correct_answers"]:
        m = pl.get_integer_attrib(element, "rows", None)
        if m is None:
            raise ValueError(
                "Number of rows is not set in pl-matrix-component-input with no correct answer."
            )
        if m < 1:
            raise ValueError(
                "Number of rows in pl-matrix-component-input must be strictly positive."
            )
        n = pl.get_integer_attrib(element, "columns", None)
        if n is None:
            raise ValueError(
                "Number of columns is not set in pl-matrix-component-input with no correct answer."
            )
        if n < 1:
            raise ValueError(
                "Number of columns in pl-matrix-component-input must be strictly positive."
            )


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    # get the name of the element, in this case, the name of the array
    name = pl.get_string_attrib(element, "answers-name")
    label = pl.get_string_attrib(element, "label", LABEL_DEFAULT)
    allow_partial_credit = pl.get_boolean_attrib(
        element, "allow-partial-credit", ALLOW_PARTIAL_CREDIT_DEFAULT
    )
    allow_feedback = pl.get_boolean_attrib(
        element, "allow-feedback", allow_partial_credit
    )
    allow_fractions = pl.get_boolean_attrib(
        element, "allow-fractions", ALLOW_FRACTIONS_DEFAULT
    )
    uuid = pl.get_uuid()

    if data["panel"] == "question":
        editable = data["editable"]

        # Get true answer
        a_tru = pl.from_json(data["correct_answers"].get(name, None))
        if a_tru is None:
            m = pl.get_integer_attrib(element, "rows")
            n = pl.get_integer_attrib(element, "columns")
        else:
            if np.isscalar(a_tru):
                raise ValueError(
                    f'Value in data["correct_answers"] for variable {name} in pl-matrix-component-input element cannot be a scalar.'
                )
            a_tru = np.array(a_tru)

            if a_tru.ndim != 2:
                raise ValueError(
                    f'Value in data["correct_answers"] for variable {name} in pl-matrix-component-input element must be a 2D array.'
                )
            m, n = np.shape(a_tru)

        input_array = create_table_for_html_display(
            m, n, name, label=label, label_uuid=uuid, data=data, format_type="input"
        )

        # Get comparison parameters and info strings
        comparison = pl.get_enum_attrib(
            element, "comparison", ComparisonMode, COMPARISON_DEFAULT
        )
        if comparison is ComparisonMode.RELABS:
            rtol = pl.get_float_attrib(element, "rtol", RTOL_DEFAULT)
            atol = pl.get_float_attrib(element, "atol", ATOL_DEFAULT)
            if rtol < 0:
                raise ValueError(f"Attribute rtol = {rtol:g} must be non-negative")
            if atol < 0:
                raise ValueError(f"Attribute atol = {atol:g} must be non-negative")
            info_params = {
                "format": True,
                "relabs": True,
                "rtol": f"{rtol:g}",
                "atol": f"{atol:g}",
            }
        elif comparison is ComparisonMode.SIGFIG:
            digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
            if digits < 0:
                raise ValueError(f"Attribute digits = {digits:d} must be non-negative")
            info_params = {
                "format": True,
                "sigfig": True,
                "digits": f"{digits:d}",
                "comparison_eps": 0.51 * (10 ** -(digits - 1)),
            }
        elif comparison is ComparisonMode.DECDIG:
            digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
            if digits < 0:
                raise ValueError(f"Attribute digits = {digits:d} must be non-negative")
            info_params = {
                "format": True,
                "decdig": True,
                "digits": f"{digits:d}",
                "comparison_eps": 0.51 * (10 ** -(digits - 0)),
            }
        else:
            assert_never(comparison)

        info_params["allow_fractions"] = allow_fractions
        with open("pl-matrix-component-input.mustache", encoding="utf-8") as f:
            info = chevron.render(f, info_params).strip()
        with open("pl-matrix-component-input.mustache", encoding="utf-8") as f:
            info_params.pop("format", None)
            info_params["shortformat"] = True
            shortinfo = chevron.render(f, info_params).strip()

        html_params: dict[str, bool | str | float | None] = {
            "question": True,
            "name": name,
            "label": label,
            "editable": editable,
            "info": info,
            "shortinfo": shortinfo,
            "input_array": input_array,
            "uuid": uuid,
            "inline": True,
        }

        partial_score = data["partial_scores"].get(name, {"score": None})
        score = partial_score.get("score", None)
        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        with open("pl-matrix-component-input.mustache", encoding="utf-8") as f:
            html = chevron.render(f, html_params).strip()

    elif data["panel"] == "submission":
        parse_error = data["format_errors"].get(name, None)
        html_params = {
            "submission": True,
            "label": label,
            "parse_error": parse_error,
        }

        if parse_error is None:
            a_submitted = pl.from_json(data["submitted_answers"].get(name, None))
            if (
                a_submitted is not None
                and isinstance(a_submitted, np.ndarray)
                and len(a_submitted.shape) == 2
            ):
                m, n = np.shape(a_submitted)
            else:
                raise ValueError(
                    f"submitted answer for {name} is not a 2D array or is not in the correct format"
                )
        else:
            a_tru = np.array(pl.from_json(data["correct_answers"].get(name, None)))
            if len(a_tru.shape) == 2:
                m, n = np.shape(a_tru)
            else:
                m = pl.get_integer_attrib(element, "rows")
                n = pl.get_integer_attrib(element, "columns")

        partial_score = data["partial_scores"].get(name, {"score": None})
        score = partial_score.get("score", None)
        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        if parse_error is None and name in data["submitted_answers"]:
            # Get submitted answer, raising an exception if it does not exist
            a_sub = data["submitted_answers"].get(name, None)
            if a_sub is None:
                raise ValueError("submitted answer is None")
            # If answer is in a format generated by pl.to_json, convert it back to a standard type (otherwise, do nothing)
            a_sub = pl.from_json(a_sub)
            # Wrap answer in an ndarray (if it's already one, this does nothing)
            a_sub = np.array(a_sub)
            # Format submitted answer as a latex string
            sub_latex = (
                "$"
                + pl.latex_from_2darray(a_sub, presentation_type="g", digits=12)
                + "$"
            )
            # When allowing feedback, display submitted answers using html table
            sub_html_table = create_table_for_html_display(
                m,
                n,
                name,
                label=label,
                label_uuid=uuid,
                data=data,
                format_type="output-feedback",
            )
            if allow_feedback and score is not None:
                if score < 1:
                    html_params["a_sub_feedback"] = sub_html_table
                else:
                    html_params["a_sub"] = sub_latex
            else:
                html_params["a_sub"] = sub_latex
        elif name not in data["submitted_answers"]:
            html_params["missing_input"] = True
            html_params["parse_error"] = None
        else:
            # create html table to show submitted answer when there is an invalid format
            html_params["raw_submitted_answer"] = create_table_for_html_display(
                m,
                n,
                name,
                label=label,
                label_uuid=uuid,
                data=data,
                format_type="output-invalid",
            )

        html_params["error"] = html_params["parse_error"] or html_params.get(
            "missing_input", False
        )

        with open("pl-matrix-component-input.mustache", encoding="utf-8") as f:
            html = chevron.render(f, html_params).strip()

    elif data["panel"] == "answer":
        # Get true answer - do nothing if it does not exist
        a_tru = pl.from_json(data["correct_answers"].get(name, None))
        if a_tru is not None:
            a_tru = np.array(a_tru)

            # Get comparison parameters and create the display data
            comparison = pl.get_enum_attrib(
                element, "comparison", ComparisonMode, COMPARISON_DEFAULT
            )
            if comparison is ComparisonMode.RELABS:
                rtol = pl.get_float_attrib(element, "rtol", RTOL_DEFAULT)
                atol = pl.get_float_attrib(element, "atol", ATOL_DEFAULT)
                # FIXME: render correctly with respect to rtol and atol
                latex_data = (
                    "$"
                    + pl.latex_from_2darray(a_tru, presentation_type="g", digits=12)
                    + "$"
                )
            elif comparison is ComparisonMode.SIGFIG:
                digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
                latex_data = (
                    "$"
                    + pl.latex_from_2darray(
                        a_tru, presentation_type="sigfig", digits=digits
                    )
                    + "$"
                )
            elif comparison is ComparisonMode.DECDIG:
                digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
                latex_data = (
                    "$"
                    + pl.latex_from_2darray(a_tru, presentation_type="f", digits=digits)
                    + "$"
                )
            else:
                assert_never(comparison)

            html_params = {
                "answer": True,
                "label": label,
                "latex_data": latex_data,
            }

            with open("pl-matrix-component-input.mustache", encoding="utf-8") as f:
                html = chevron.render(f, html_params).strip()
        else:
            html = ""

    else:
        raise ValueError("Invalid panel type: {}".format(data["panel"]))

    return html


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    allow_fractions = pl.get_boolean_attrib(
        element, "allow-fractions", ALLOW_FRACTIONS_DEFAULT
    )
    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    blank_value = pl.get_string_attrib(element, "blank-value", str(BLANK_VALUE_DEFAULT))

    # Get dimensions of the input matrix
    a_tru = pl.from_json(data["correct_answers"].get(name, None))
    if a_tru is None:
        m = pl.get_integer_attrib(element, "rows")
        n = pl.get_integer_attrib(element, "columns")
    else:
        a_tru = np.array(a_tru)
        if a_tru.ndim != 2:
            raise ValueError("true answer must be a 2D array")
        m, n = np.shape(a_tru)
    matrix = np.empty((m, n))

    # Create an array for the submitted answer to be stored in data['submitted_answer'][name]
    # used for display in the answer and submission panels
    # Also creates invalid error messages
    invalid_format = False
    for i in range(m):
        for j in range(n):
            each_entry_name = name + str(n * i + j + 1)
            a_sub = data["submitted_answers"].get(each_entry_name, None)
            if allow_blank and a_sub is not None and a_sub.strip() == "":
                a_sub = blank_value
            res = pl.string_fraction_to_number(
                a_sub, allow_fractions=allow_fractions, allow_complex=False
            )
            if res[0] is not None:
                value, newdata = res
                matrix[i, j] = value
                data["submitted_answers"][each_entry_name] = newdata[
                    "submitted_answers"
                ]
            else:
                _, newdata = res
                invalid_format = True
                data["format_errors"][each_entry_name] = newdata["format_errors"]
                data["submitted_answers"][each_entry_name] = None

    if invalid_format:
        with open("pl-matrix-component-input.mustache", encoding="utf-8") as f:
            data["format_errors"][name] = chevron.render(
                f, {"format_error": True, "allow_fractions": allow_fractions}
            ).strip()
        data["submitted_answers"][name] = None
    else:
        data["submitted_answers"][name] = pl.to_json(matrix)


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    allow_partial_credit = pl.get_boolean_attrib(
        element, "allow-partial-credit", ALLOW_PARTIAL_CREDIT_DEFAULT
    )

    # Get weight
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    # Get method of comparison, with relabs as default
    comparison = pl.get_enum_attrib(
        element, "comparison", ComparisonMode, COMPARISON_DEFAULT
    )

    rtol, atol, digits = RTOL_DEFAULT, ATOL_DEFAULT, DIGITS_DEFAULT
    if comparison is ComparisonMode.RELABS:
        rtol = pl.get_float_attrib(element, "rtol", RTOL_DEFAULT)
        atol = pl.get_float_attrib(element, "atol", ATOL_DEFAULT)
    elif comparison in (ComparisonMode.SIGFIG, ComparisonMode.DECDIG):
        digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
    else:
        assert_never(comparison)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = pl.from_json(data["correct_answers"].get(name, None))
    if a_tru is None:
        return
    # Wrap true answer in ndarray (if it already is one, this does nothing)
    a_tru = np.array(a_tru)
    # Throw an error if true answer is not a 2D numpy array
    if a_tru.ndim != 2:
        raise ValueError("true answer must be a 2D array")
    m, n = np.shape(a_tru)

    number_of_correct = 0
    feedback = {}
    for i in range(m):
        for j in range(n):
            each_entry_name = name + str(n * i + j + 1)
            a_sub = data["submitted_answers"].get(each_entry_name, None)
            # Get submitted answer (if it does not exist, score is zero)
            if a_sub is None:
                data["partial_scores"][name] = {"score": 0, "weight": weight}
                return
            # If submitted answer is in a format generated by pl.to_json, convert it
            # back to a standard type (otherwise, do nothing)
            a_sub = pl.from_json(a_sub)

            # If submitted answer is not a of valid type, score is zero
            if isinstance(a_sub, (Expr, dict)):
                data["partial_scores"][name] = {"score": 0, "weight": weight}
                return

            # Compare submitted answer with true answer
            if comparison is ComparisonMode.RELABS:
                correct = pl.is_correct_scalar_ra(a_sub, a_tru[i, j], rtol, atol)
            elif comparison is ComparisonMode.SIGFIG:
                correct = pl.is_correct_scalar_sf(a_sub, a_tru[i, j], digits)
            elif comparison is ComparisonMode.DECDIG:
                correct = pl.is_correct_scalar_dd(a_sub, a_tru[i, j], digits)
            else:
                assert_never(comparison)
            if correct:
                number_of_correct += 1
                feedback.update({each_entry_name: "correct"})
            else:
                feedback.update({each_entry_name: "incorrect"})

    if number_of_correct == m * n:
        data["partial_scores"][name] = {"score": 1, "weight": weight}
    else:
        if not allow_partial_credit:
            score_value = 0
        else:
            score_value = number_of_correct / (m * n)
        data["partial_scores"][name] = {
            "score": score_value,
            "weight": weight,
            "feedback": feedback,
        }


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    allow_partial_credit = pl.get_boolean_attrib(
        element, "allow-partial-credit", ALLOW_PARTIAL_CREDIT_DEFAULT
    )

    # Get correct answer
    a_tru = data["correct_answers"][name]
    # If correct answer is in a format generated by pl.to_json, convert it
    # back to a standard type (otherwise, do nothing)
    a_tru = pl.from_json(a_tru)
    # Wrap true answer in ndarray (if it already is one, this does nothing)
    a_tru = np.array(a_tru)
    # Throw an error if true answer is not a 2D numpy array
    if a_tru.ndim != 2:
        raise ValueError("true answer must be a 2D array")
    m, n = np.shape(a_tru)

    result = data["test_type"]

    number_of_correct = 0
    feedback = {}
    for i in range(m):
        for j in range(n):
            each_entry_name = name + str(n * i + j + 1)

            if result == "correct":
                data["raw_submitted_answers"][each_entry_name] = str(a_tru[i, j])
                number_of_correct += 1
                feedback.update({each_entry_name: "correct"})
            elif result == "incorrect":
                data["raw_submitted_answers"][each_entry_name] = str(
                    a_tru[i, j] + (random.uniform(1, 10) * random.choice([-1, 1]))
                )
                feedback.update({each_entry_name: "incorrect"})
            elif result == "invalid":
                if random.choice([True, False]):
                    data["raw_submitted_answers"][each_entry_name] = "1,2"
                    data["format_errors"][each_entry_name] = "(Invalid format)"
                else:
                    data["raw_submitted_answers"][name] = ""
                    data["format_errors"][each_entry_name] = "(Invalid blank entry)"
            else:
                raise RuntimeError(f"invalid result: {result}")

    if result == "invalid":
        data["format_errors"][name] = (
            "At least one of the entries has invalid format (empty entries or not a double precision floating point number)"
        )

    if number_of_correct == m * n:
        data["partial_scores"][name] = {"score": 1, "weight": weight}
    else:
        if not allow_partial_credit:
            score_value = 0
        else:
            score_value = number_of_correct / (m * n)
        data["partial_scores"][name] = {
            "score": score_value,
            "weight": weight,
            "feedback": feedback,
        }


def create_table_for_html_display(
    m: int,
    n: int,
    name: str,
    label: str | None,
    label_uuid: str,
    data: pl.QuestionData,
    format_type: Literal["output-invalid", "output-feedback", "input"],
) -> str:
    editable = data["editable"]

    label_attr = (
        f'aria-labelledby="pl-matrix-component-input-{label_uuid}-label"'
        if label
        else ""
    )
    if format_type == "output-invalid":
        display_array = "<table>"
        display_array += "<tr>"
        display_array += (
            '<td class="pl-matrix-component-input-close-left" rowspan="'
            + str(m)
            + '"></td>'
        )
        display_array += '<td style="width:4px" rowspan="' + str(m) + '"></td>'
        # First row of array
        for j in range(n):
            each_entry_name = name + str(j + 1)
            raw_submitted_answer = data["raw_submitted_answers"].get(
                each_entry_name, ""
            )
            format_errors = data["format_errors"].get(each_entry_name, None)
            if format_errors is None:
                display_array += '<td class="allborder"><code class="user-output">'
            else:
                display_array += (
                    '<td class="allborder"><code class="user-output-invalid">'
                )
            display_array += escape(pl.escape_unicode_string(raw_submitted_answer))
            display_array += "</code></td> "
        display_array += '<td style="width:4px" rowspan="' + str(m) + '"></td>'
        display_array += (
            '<td class="pl-matrix-component-input-close-right" rowspan="'
            + str(m)
            + '"></td>'
        )
        # Add the other rows
        for i in range(1, m):
            display_array += " <tr>"
            for j in range(n):
                each_entry_name = name + str(n * i + j + 1)
                raw_submitted_answer = data["raw_submitted_answers"].get(
                    each_entry_name, ""
                )
                format_errors = data["format_errors"].get(each_entry_name, None)
                if format_errors is None:
                    display_array += '<td class="allborder"><code class="user-output">'
                else:
                    display_array += (
                        '<td class="allborder"><code class="user-output-invalid">'
                    )
                display_array += escape(pl.escape_unicode_string(raw_submitted_answer))
                display_array += "</code></td> "
            display_array += "</tr>"
        display_array += "</table>"

    elif format_type == "output-feedback":
        partial_score_feedback = data["partial_scores"].get(name, {"feedback": None})
        feedback_each_entry = partial_score_feedback.get("feedback")
        score = partial_score_feedback.get("score")

        if score is not None:
            score = float(score)
            if score >= 1:
                score_message = '&nbsp;<span class="badge text-bg-success"><i class="fa fa-check" aria-hidden="true"></i> 100%</span>'
            elif score > 0:
                score_message = (
                    '&nbsp;<span class="badge text-bg-warning"><i class="far fa-circle" aria-hidden="true"></i>'
                    + str(math.floor(score * 100))
                    + "%</span>"
                )
            else:
                score_message = '&nbsp;<span class="badge text-bg-danger"><i class="fa fa-times" aria-hidden="true"></i> 0%</span>'
        else:
            score_message = ""

        display_array = "<table>"
        display_array += "<tr>"
        # Add the prefix
        if label is not None:
            display_array += '<td rowspan="0">' + label + "&nbsp;</td>"
        display_array += (
            '<td class="pl-matrix-component-input-close-left" rowspan="'
            + str(m)
            + '"></td>'
        )
        display_array += '<td style="width:4px" rowspan="' + str(m) + '"></td>'
        # First row of array
        for j in range(n):
            each_entry_name = name + str(j + 1)
            raw_submitted_answer = data["raw_submitted_answers"].get(
                each_entry_name, ""
            )
            display_array += '<td class="allborder">'
            display_array += escape(raw_submitted_answer)
            if feedback_each_entry is not None and isinstance(
                feedback_each_entry, dict
            ):
                if feedback_each_entry[each_entry_name] == "correct":
                    feedback_message = '&nbsp;<span class="badge text-bg-success"><i class="fa fa-check" aria-hidden="true"></i></span>'
                elif feedback_each_entry[each_entry_name] == "incorrect":
                    feedback_message = '&nbsp;<span class="badge text-bg-danger"><i class="fa fa-times" aria-hidden="true"></i></span>'
                else:
                    raise ValueError(
                        f"invalid feedback type: {feedback_each_entry[each_entry_name]}"
                    )
                display_array += feedback_message
            display_array += "</td> "
        # Add the suffix
        display_array += '<td style="width:4px" rowspan="' + str(m) + '"></td>'
        display_array += (
            '<td class="pl-matrix-component-input-close-right" rowspan="'
            + str(m)
            + '"></td>'
        )
        if score_message:
            display_array += '<td rowspan="0">&nbsp;' + score_message + "</td>"
        display_array += "</tr>"
        # Add the other rows
        for i in range(1, m):
            display_array += " <tr>"
            for j in range(n):
                each_entry_name = name + str(n * i + j + 1)
                raw_submitted_answer = data["raw_submitted_answers"].get(
                    each_entry_name, ""
                )
                display_array += (
                    f' <td class="allborder" aria-label="Row {i + 1}, Column {j + 1}"> '
                )
                display_array += escape(raw_submitted_answer)
                if feedback_each_entry is not None and isinstance(
                    feedback_each_entry, dict
                ):
                    if feedback_each_entry[each_entry_name] == "correct":
                        feedback_message = '&nbsp;<span class="badge text-bg-success"><i class="fa fa-check" aria-hidden="true"></i></span>'
                    elif feedback_each_entry[each_entry_name] == "incorrect":
                        feedback_message = '&nbsp;<span class="badge text-bg-danger"><i class="fa fa-times" aria-hidden="true"></i></span>'
                    else:
                        raise ValueError(
                            "invalid feedback type: this should not happen"
                        )
                    display_array += feedback_message
                display_array += " </td> "
            display_array += "</tr>"
        display_array += "</table>"

    elif format_type == "input":
        display_array = f'<table role="grid" {label_attr}>'
        display_array += "<tr>"
        # Add first row
        display_array += (
            '<td class="pl-matrix-component-input-close-left" rowspan="'
            + str(m)
            + '"></td>'
        )
        display_array += '<td style="width:4px" rowspan="' + str(m) + '"></td>'
        for j in range(n):
            each_entry_name = name + str(j + 1)
            raw_submitted_answer = data["raw_submitted_answers"].get(
                each_entry_name, None
            )
            display_array += f' <td> <input name= "{each_entry_name}" type="text" size="8" aria-label="Row 1, Column {j + 1}" '
            if not editable:
                display_array += " disabled "
            if raw_submitted_answer is not None:
                display_array += '  value= "'
                display_array += escape(raw_submitted_answer)
            display_array += '" /> </td>'
        display_array += '<td style="width:4px" rowspan="' + str(m) + '"></td>'
        display_array += (
            '<td class="pl-matrix-component-input-close-right" rowspan="'
            + str(m)
            + '"></td>'
        )
        # Add other rows
        for i in range(1, m):
            display_array += " <tr>"
            for j in range(n):
                each_entry_name = name + str(n * i + j + 1)
                raw_submitted_answer = data["raw_submitted_answers"].get(
                    each_entry_name, None
                )
                display_array += f' <td> <input name= "{each_entry_name}" type="text" size="8" aria-label="Row {i + 1}, Column {j + 1}" '
                if not editable:
                    display_array += " disabled "
                if raw_submitted_answer is not None:
                    display_array += '  value= "'
                    display_array += escape(raw_submitted_answer)
                display_array += '" /> </td>'
                display_array += " </td> "
            display_array += "</tr>"
        display_array += "</table>"

    else:
        assert_never(format_type)

    return display_array
