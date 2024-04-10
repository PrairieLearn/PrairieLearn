import math
import random

import chevron
import lxml.html
import numpy as np
import prairielearn as pl

WEIGHT_DEFAULT = 1
LABEL_DEFAULT = None
COMPARISON_DEFAULT = "relabs"
RTOL_DEFAULT = 1e-2
ATOL_DEFAULT = 1e-8
DIGITS_DEFAULT = 2
ALLOW_COMPLEX_DEFAULT = False
SHOW_HELP_TEXT_DEFAULT = True


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["answers-name"]
    optional_attribs = [
        "weight",
        "label",
        "comparison",
        "rtol",
        "atol",
        "digits",
        "allow-complex",
        "show-help-text",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, "answers-name")
    pl.check_answers_names(data, name)


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    label = pl.get_string_attrib(element, "label", LABEL_DEFAULT)

    if "_pl_matrix_input_format" in data["submitted_answers"]:
        format_type = data["submitted_answers"]["_pl_matrix_input_format"].get(
            name, "matlab"
        )
    else:
        format_type = "matlab"

    if data["panel"] == "question":
        editable = data["editable"]
        raw_submitted_answer = data["raw_submitted_answers"].get(name, None)

        # Get comparison parameters and info strings
        comparison = pl.get_string_attrib(element, "comparison", COMPARISON_DEFAULT)
        if comparison == "relabs":
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
        elif comparison == "sigfig":
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
            }
        elif comparison == "decdig":
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
            }
        else:
            raise ValueError(
                'method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")'
                % comparison
            )
        info_params["allow_complex"] = pl.get_boolean_attrib(
            element, "allow-complex", ALLOW_COMPLEX_DEFAULT
        )
        with open("pl-matrix-input.mustache", "r", encoding="utf-8") as f:
            info = chevron.render(f, info_params).strip()
        with open("pl-matrix-input.mustache", "r", encoding="utf-8") as f:
            info_params.pop("format", None)
            info_params["shortformat"] = True
            shortinfo = chevron.render(f, info_params).strip()

        html_params = {
            "question": True,
            "name": name,
            "label": label,
            "editable": editable,
            "info": info,
            "shortinfo": shortinfo,
            "show_info": pl.get_boolean_attrib(
                element, "show-help-text", SHOW_HELP_TEXT_DEFAULT
            ),
            "uuid": pl.get_uuid(),
        }

        partial_score = data["partial_scores"].get(name, {"score": None})
        score = partial_score.get("score", None)
        if score is not None:
            try:
                score = float(score)
                if score >= 1:
                    html_params["correct"] = True
                elif score > 0:
                    html_params["partial"] = math.floor(score * 100)
                else:
                    html_params["incorrect"] = True
            except Exception:
                raise ValueError("invalid score" + score)

        if raw_submitted_answer is not None:
            html_params["raw_submitted_answer"] = pl.escape_unicode_string(
                raw_submitted_answer
            )
        with open("pl-matrix-input.mustache", "r", encoding="utf-8") as f:
            html = chevron.render(f, html_params).strip()

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
                raise Exception("submitted answer is None")

            # If answer is in a format generated by pl.to_json, convert it
            # back to a standard type (otherwise, do nothing)
            a_sub = pl.from_json(a_sub)

            # Wrap answer in an ndarray (if it's already one, this does nothing)
            a_sub = np.array(a_sub)

            # Format answer as a string
            html_params["a_sub"] = pl.string_from_2darray(
                a_sub, language=format_type, digits=12, presentation_type="g"
            )
        elif name not in data["submitted_answers"]:
            html_params["missing_input"] = True
            html_params["parse_error"] = None
        else:
            raw_submitted_answer = data["raw_submitted_answers"].get(name, None)
            if raw_submitted_answer is not None:
                html_params["raw_submitted_answer"] = pl.escape_unicode_string(
                    raw_submitted_answer
                )

        partial_score = data["partial_scores"].get(name, {"score": None})
        score = partial_score.get("score", None)
        if score is not None:
            try:
                score = float(score)
                if score >= 1:
                    html_params["correct"] = True
                elif score > 0:
                    html_params["partial"] = math.floor(score * 100)
                else:
                    html_params["incorrect"] = True
            except Exception:
                raise ValueError("invalid score" + score)

        html_params["error"] = html_params["parse_error"] or html_params.get(
            "missing_input", False
        )

        with open("pl-matrix-input.mustache", "r", encoding="utf-8") as f:
            html = chevron.render(f, html_params).strip()

    elif data["panel"] == "answer":
        # Get true answer - do nothing if it does not exist
        a_tru = pl.from_json(data["correct_answers"].get(name, None))
        if a_tru is not None:
            a_tru = np.array(a_tru)

            # Get comparison parameters
            comparison = pl.get_string_attrib(element, "comparison", COMPARISON_DEFAULT)
            if comparison == "relabs":
                rtol = pl.get_float_attrib(element, "rtol", RTOL_DEFAULT)
                atol = pl.get_float_attrib(element, "atol", ATOL_DEFAULT)
                # FIXME: render correctly with respect to rtol and atol
                matlab_data = pl.string_from_2darray(
                    a_tru, language="matlab", digits=12, presentation_type="g"
                )
                python_data = pl.string_from_2darray(
                    a_tru, language="python", digits=12, presentation_type="g"
                )
            elif comparison == "sigfig":
                digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
                matlab_data = pl.string_from_2darray(
                    a_tru, language="matlab", digits=digits, presentation_type="sigfig"
                )
                python_data = pl.string_from_2darray(
                    a_tru, language="python", digits=digits, presentation_type="sigfig"
                )
            elif comparison == "decdig":
                digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
                matlab_data = pl.string_from_2darray(
                    a_tru, language="matlab", digits=digits, presentation_type="f"
                )
                python_data = pl.string_from_2darray(
                    a_tru, language="python", digits=digits, presentation_type="f"
                )
            else:
                raise ValueError(
                    'method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")'
                    % comparison
                )

            html_params = {
                "answer": True,
                "label": label,
                "matlab_data": matlab_data,
                "python_data": python_data,
                "uuid": pl.get_uuid(),
            }

            if format_type == "matlab":
                html_params["default_is_matlab"] = True
            else:
                html_params["default_is_python"] = True
            with open("pl-matrix-input.mustache", "r", encoding="utf-8") as f:
                html = chevron.render(f, html_params).strip()
        else:
            html = ""

    else:
        raise Exception("Invalid panel type: %s" % data["panel"])

    return html


def get_format_string(message):
    params = {"format_error": True, "format_error_message": message}
    with open("pl-matrix-input.mustache", "r", encoding="utf-8") as f:
        return chevron.render(f, params).strip()


def parse(element_html, data):
    # By convention, this function returns at the first error found

    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data["submitted_answers"].get(name, None)
    if a_sub is None:
        data["format_errors"][name] = get_format_string("No submitted answer.")
        data["submitted_answers"][name] = None
        return

    # Convert submitted answer to numpy array (return parse_error on failure)
    (a_sub_parsed, info) = pl.string_to_2darray(a_sub, allow_complex=allow_complex)
    if a_sub_parsed is None:
        data["format_errors"][name] = get_format_string(info["format_error"])
        data["submitted_answers"][name] = None
        return

    # Replace submitted answer with numpy array
    data["submitted_answers"][name] = pl.to_json(a_sub_parsed)

    # Store format type
    if "_pl_matrix_input_format" not in data["submitted_answers"]:
        data["submitted_answers"]["_pl_matrix_input_format"] = {}
    data["submitted_answers"]["_pl_matrix_input_format"][name] = info["format_type"]


def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")

    # Get weight
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

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

    # Get submitted answer (if it does not exist, score is zero)
    a_sub = data["submitted_answers"].get(name, None)
    if a_sub is None:
        data["partial_scores"][name] = {"score": 0, "weight": weight}
        return
    # If submitted answer is in a format generated by pl.to_json, convert it
    # back to a standard type (otherwise, do nothing)
    a_sub = pl.from_json(a_sub)
    # Wrap submitted answer in an ndarray (if it's already one, this does nothing)
    a_sub = np.array(a_sub)

    # If true and submitted answers have different shapes, score is zero
    if not (a_sub.shape == a_tru.shape):
        data["partial_scores"][name] = {"score": 0, "weight": weight}
        return

    # Get method of comparison, with relabs as default
    comparison = pl.get_string_attrib(element, "comparison", COMPARISON_DEFAULT)

    # Compare submitted answer with true answer
    if comparison == "relabs":
        rtol = pl.get_float_attrib(element, "rtol", RTOL_DEFAULT)
        atol = pl.get_float_attrib(element, "atol", ATOL_DEFAULT)
        correct = pl.is_correct_ndarray2D_ra(a_sub, a_tru, rtol, atol)
    elif comparison == "sigfig":
        digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
        correct = pl.is_correct_ndarray2D_sf(a_sub, a_tru, digits)
    elif comparison == "decdig":
        digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
        correct = pl.is_correct_ndarray2D_dd(a_sub, a_tru, digits)
    else:
        raise ValueError('method of comparison "%s" is not valid' % comparison)

    if correct:
        data["partial_scores"][name] = {"score": 1, "weight": weight}
    else:
        data["partial_scores"][name] = {"score": 0, "weight": weight}


def test(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    # Get correct answer
    a_tru = data["correct_answers"][name]

    # If correct answer is in a format generated by pl.to_json, convert it
    # back to a standard type (otherwise, do nothing)
    a_tru = pl.from_json(a_tru)

    # Wrap true answer in ndarray (if it already is one, this does nothing)
    a_tru = np.array(a_tru)

    result = data["test_type"]
    if random.choice([True, False]):
        # matlab
        if result == "correct":
            data["raw_submitted_answers"][name] = pl.numpy_to_matlab(
                a_tru, ndigits=12, wtype="g"
            )
            data["partial_scores"][name] = {"score": 1, "weight": weight}
        elif result == "incorrect":
            data["raw_submitted_answers"][name] = pl.numpy_to_matlab(
                a_tru + (random.uniform(1, 10) * random.choice([-1, 1])),
                ndigits=12,
                wtype="g",
            )
            data["partial_scores"][name] = {"score": 0, "weight": weight}
        elif result == "invalid":
            invalid_cases = {
                "invalid commas": [
                    "[,,1, 2, 3]",
                    "[1,, 2, 3]",
                    "[1, 2,, 3]",
                    "[1, 2, 3,,]",
                    "[, ,1, 2, 3]",
                    "[1, , 2, 3]",
                    "[1, 2, , 3]",
                    "[1, 2, 3, ,]",
                ],
                "uneven dimensions": [
                    "[1; 2 3]",
                    "[1 2; 3]",
                    "[1; 2, 3]",
                    "[1, 2; 3]",
                ],
                "unbalanced brackets": [
                    "[1 2 3",
                    "1 2 3]",
                    "[1, 2, 3",
                    "1, 2, 3]",
                ],
                "non-spaces outside brackets": [
                    "1 [2 3]",
                    "[1 2] 3",
                    "1 [2, 3]",
                    "[1, 2] 3",
                ],
                "not finite": [
                    "np.inf",
                    "[np.inf]",
                    "[1 2 np.inf]",
                    "[1, 2, np.inf]",
                ],
                "empty matrix": [
                    "[]",
                    "[,]",
                ],
            }

            error = random.choice(list(invalid_cases))
            data["raw_submitted_answers"][name] = random.choice(invalid_cases[error])
            data["format_errors"][name] = error
        else:
            raise Exception("invalid result: %s" % result)
    else:
        # python
        if result == "correct":
            data["raw_submitted_answers"][name] = str(np.array(a_tru).tolist())
            data["partial_scores"][name] = {"score": 1, "weight": weight}
        elif result == "incorrect":
            data["raw_submitted_answers"][name] = str(
                (a_tru + (random.uniform(1, 10) * random.choice([-1, 1]))).tolist()
            )
            data["partial_scores"][name] = {"score": 0, "weight": weight}
        elif result == "invalid":
            # FIXME: add more invalid expressions, make text of format_errors
            # correct, and randomize
            data["raw_submitted_answers"][name] = "[[1, 2, 3], [4, 5]]"
            data["format_errors"][name] = "invalid"
        else:
            raise Exception("invalid result: %s" % result)
