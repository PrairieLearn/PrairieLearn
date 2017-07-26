import lxml.html
from html import escape
import numpy as np
import chevron
import prairielearn as pl



def prepare(element_html, element_index, data, options):
    return data

def render(element_html, element_index, data, options):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")
    label = pl.get_string_attrib(element,"label",None)

    if options["panel"] == "question":
        editable = options["editable"]
        raw_submitted_answer = options["raw_submitted_answer"].get(name, None)

        # Get comparison parameters and info string
        comparison = pl.get_string_attrib(element, "comparison","relabs")
        if comparison=="relabs":
            rtol = pl.get_float_attrib(element,"rtol",1e-5)
            atol = pl.get_float_attrib(element,"atol",1e-8)
            info_params = {'matrix_matlab': True, 'relabs': True, 'rtol': rtol, 'atol': atol}
        elif comparison=="sigfig":
            digits = pl.get_integer_attrib(element,"digits",2)
            info_params = {'matrix_matlab': True, 'sigfig': True, 'digits': digits}
        elif comparison=="decdig":
            digits = pl.get_integer_attrib(element,"digits",2)
            info_params = {'matrix_matlab': True, 'decdig': True, 'digits': digits}
        else:
            raise ValueError('method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")' % comparison)
        with open('format.mustache','r') as f:
            info = chevron.render(f,info_params).rstrip()

        html_params = {'question': True, 'name': name, 'label': label, 'editable': editable, 'info': info}
        if raw_submitted_answer is not None:
            html_params['raw_submitted_answer'] = escape(raw_submitted_answer)
        with open('matrix_input.mustache','r') as f:
            html = chevron.render(f,html_params)

    elif options["panel"] == "submission":
        parse_error = data["parse_errors"].get(name, None)
        html_params = {'submission': True, 'label': label, 'parse_error': parse_error}
        if parse_error is None:
            a_sub = np.array(data["submitted_answer"][name])
            html_params['a_sub'] = pl.numpy_to_matlab(a_sub,ndigits=12,wtype='g')
        with open('matrix_input.mustache','r') as f:
            html = chevron.render(f,html_params)
    elif options["panel"] == "answer":
        # Get true answer - do nothing if it does not exist
        a_tru = data["true_answer"].get(name, None)
        if a_tru is not None:
            a_tru = np.array(a_tru)

            # FIXME: render correctly with respect to method of comparison
            html_params = {'answer': True, 'label': label, 'a_tru': pl.numpy_to_matlab(a_tru,ndigits=12,wtype='g')}
            with open('matrix_input.mustache','r') as f:
                html = chevron.render(f,html_params)
        else:
            html = ""

    else:
        raise Exception("Invalid panel type: %s" % options["panel"])

    return html

def parse(element_html, element_index, data, options):
    # By convention, this function returns at the first error found

    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data["submitted_answer"].get(name,None)
    if not a_sub:
        data["parse_errors"][name] = 'No submitted answer.'
        data["submitted_answer"][name] = None
        return data

    # Convert submitted answer to numpy array (return parse_error on failure)
    (a_sub_parsed,parse_error) = pl.matlab_to_numpy(a_sub)
    if a_sub_parsed is None:
        data["parse_errors"][name] = parse_error
        data["submitted_answer"][name] = None
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
    comparison = pl.get_string_attrib(element, "comparison","relabs")

    # Compare submitted answer with true answer
    if comparison=="relabs":
        rtol = pl.get_float_attrib(element,"rtol",1e-5)
        atol = pl.get_float_attrib(element,"atol",1e-8)
        correct = pl.is_correct_ndarray2D_ra(a_sub,a_tru,rtol,atol)
    elif comparison=="sigfig":
        digits = pl.get_integer_attrib(element,"digits",2)
        eps_digits = pl.get_integer_attrib(element,"eps_digits",3)
        correct = pl.is_correct_ndarray2D_sf(a_sub,a_tru,digits,eps_digits)
    elif comparison=="decdig":
        digits = pl.get_integer_attrib(element,"digits",2)
        eps_digits = pl.get_integer_attrib(element,"eps_digits",3)
        correct = pl.is_correct_ndarray2D_dd(a_sub,a_tru,digits,eps_digits)
    else:
        raise ValueError('method of comparison "%s" is not valid' % comparison)

    if correct:
        data["partial_scores"][name] = {"score": 1, "weight": weight}
    else:
        data["partial_scores"][name] = {"score": 0, "weight": weight}

    return data
