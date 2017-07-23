import lxml.html
import numpy as np
import sys
import prairielearn as pl
from html import escape


# TODO: check element attributes (like in numberInput.js)

def prepare(element_html, element_index, data, options):
    # element = lxml.html.fragment_fromstring(element_html)
    # name = pl.get_string_attrib(element, "name")
    return data

def render(element_html, element_index, data, options):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")
    style = pl.get_string_attrib(element, "style", None)
    if style is None:
        style = ""
    else:
        style = 'style="'+style+'"'

    if options["panel"] == "question":
        editable = options["editable"]
        raw_submitted_answer = options["raw_submitted_answer"].get(name, None)
        html = '<input name="' + name + '"' \
            + ('' if editable else ' disabled') \
            + ('' if (raw_submitted_answer is None) else (' value="' + escape(raw_submitted_answer) + '" ')) \
            + style + '/>'
    elif options["panel"] == "submission":
        parse_error = data["parse_errors"].get(name, None)
        if parse_error is not None:
            html = '<pre ' + style + '>' + '<strong>INVALID\n&nbsp;...&nbsp;</strong>' + parse_error + '</pre>'
        else:
            # Get submitted answer or throw exception if it does not exist
            a_sub = np.array(data["submitted_answer"][name])
            html = '<pre ' + style + '>' + pl.numpy_to_matlab(a_sub,ndigits=12,wtype='g') + '</pre>'
    elif options["panel"] == "answer":
        # Get true answer or throw exception if it does not exist
        a_tru = np.array(data["true_answer"][name])
        # FIXME: render correctly with respect to method of comparison
        html = '<pre ' + style + '>' + pl.numpy_to_matlab(a_tru,ndigits=12,wtype='g') + '</pre>'
    else:
        raise Exception("Invalid panel type: %s" % options["panel"])

    return html

def parse(element_html, element_index, data, options):
    # By convention, this function returns at the first error found

    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data["submitted_answer"].get(name,None)
    if a_sub is None:
        data["parse_errors"][name] = 'No submitted answer.'
        return data

    # Convert submitted answer to numpy array (return parse_error on failure)
    (a_sub_parsed,parse_error) = pl.matlab_to_numpy(a_sub)
    if a_sub_parsed is None:
        data["parse_errors"][name] = parse_error
        return data

    # Replace submitted answer with numpy array
    data["submitted_answer"][name] = a_sub_parsed.tolist()

    return data

def grade(element_html, element_index, data, options):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")

    # Get weight
    weight = pl.get_integer_attrib(element, "weight", 1)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = data["true_answer"].get(name,None)
    if a_tru is None:
        return data
    # Convert true answer to numpy
    a_tru = np.array(a_tru)
    # Throw an error if true answer is not a 2D numpy array
    if a_tru.ndim != 2:
        raise ValueError('true answer must be a 2D array')

    # Get submitted answer (if it does not exist, score is zero)
    a_sub = data["submitted_answer"].get(name,None)
    if a_sub is None:
        data["partial_scores"][name] = {"score": 0, "weight": weight}
        return data
    # Convert submitted answer to numpy
    a_sub = np.array(a_sub)

    # If true and submitted answers have different shapes, score is zero
    if not (a_sub.shape==a_tru.shape):
        data["partial_scores"][name] = {"score": 0, "weight": weight}
        return data

    # Get method of comparison, with relabs as default
    comparison = pl.get_string_attrib(element, "name","relabs")

    # Compare submitted answer with true answer
    if comparison=="relabs":
        rtol = pl.get_float_attrib("rtol","1e-5")
        atol = pl.get_float_attrib("atol","1e-8")
        correct = is_correct_ndarray2D_ra(a_sub,a_tru,rtol,atol)
    elif comparison=="sigfig":
        digits = pl.get_float_attrib("digits","2")
        eps_digits = pl.get_float_attrib("eps_digits","3")
        correct = is_correct_ndarray2D_sf(a_sub,a_tru,digits,eps_digits)
    elif comparison=="decdig":
        digits = pl.get_float_attrib("digits","2")
        eps_digits = pl.get_float_attrib("eps_digits","3")
        correct = is_correct_ndarray2D_dd(a_sub,a_tru,digits,eps_digits)
    else:
        raise ValueError('method of comparison "%s" is not valid' % comparison)

    if correct:
        data["partial_scores"][name] = {"score": 1, "weight": weight}
    else:
        data["partial_scores"][name] = {"score": 0, "weight": weight}

    return data
