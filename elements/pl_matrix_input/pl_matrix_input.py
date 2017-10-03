import prairielearn as pl
import lxml.html
from html import escape
import numpy as np
import chevron


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers_name']
    optional_attribs = ['weight', 'correct_answer', 'label', 'comparison', 'rtol', 'atol', 'digits', 'eps_digits']
    pl.check_attribs(element, required_attribs, optional_attribs)
    return data


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')
    label = pl.get_string_attrib(element, 'label', None)

    if data['panel'] == 'question':
        editable = data['editable']
        raw_submitted_answer = data['raw_submitted_answers'].get(name, None)

        # Get comparison parameters and info strings
        comparison = pl.get_string_attrib(element, 'comparison', 'relabs')
        if comparison == 'relabs':
            rtol = pl.get_float_attrib(element, 'rtol', 1e-5)
            atol = pl.get_float_attrib(element, 'atol', 1e-8)
            info_params = {'format': True, 'relabs': True, 'rtol': rtol, 'atol': atol}
        elif comparison == 'sigfig':
            digits = pl.get_integer_attrib(element, 'digits', 2)
            info_params = {'format': True, 'sigfig': True, 'digits': digits}
        elif comparison == 'decdig':
            digits = pl.get_integer_attrib(element, 'digits', 2)
            info_params = {'format': True, 'decdig': True, 'digits': digits}
        else:
            raise ValueError('method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")' % comparison)
        with open('pl_matrix_input.mustache', 'r') as f:
            info = chevron.render(f, info_params).strip()
        with open('pl_matrix_input.mustache', 'r') as f:
            info_params.pop('format', None)
            info_params['shortformat'] = True
            shortinfo = chevron.render(f, info_params).strip()

        html_params = {'question': True, 'name': name, 'label': label, 'editable': editable, 'info': info, 'shortinfo': shortinfo}
        if raw_submitted_answer is not None:
            html_params['raw_submitted_answer'] = escape(raw_submitted_answer)
        with open('pl_matrix_input.mustache', 'r') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'submission':
        parse_error = data['format_errors'].get(name, None)
        html_params = {'submission': True, 'label': label, 'parse_error': parse_error}
        if parse_error is None:
            a_sub = np.array(data['submitted_answers'][name])
            html_params['a_sub'] = pl.numpy_to_matlab(a_sub, ndigits=12, wtype='g')
        else:
            raw_submitted_answer = data['raw_submitted_answers'].get(name, None)
            if raw_submitted_answer is not None:
                html_params['raw_submitted_answer'] = escape(raw_submitted_answer)
        with open('pl_matrix_input.mustache', 'r') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'answer':
        # Get true answer - do nothing if it does not exist
        a_tru = pl.from_json(data['correct_answers'].get(name, None))
        if a_tru is not None:
            a_tru = np.array(a_tru)

            # Get comparison parameters
            comparison = pl.get_string_attrib(element, 'comparison', 'relabs')
            if comparison == 'relabs':
                rtol = pl.get_float_attrib(element, 'rtol', 1e-5)
                atol = pl.get_float_attrib(element, 'atol', 1e-8)
                # FIXME: render correctly with respect to rtol and atol
                a_tru = pl.numpy_to_matlab(a_tru, ndigits=12, wtype='g')
            elif comparison == 'sigfig':
                digits = pl.get_integer_attrib(element, 'digits', 2)
                a_tru = pl.numpy_to_matlab_sf(a_tru, ndigits=digits)
            elif comparison == 'decdig':
                digits = pl.get_integer_attrib(element, 'digits', 2)
                a_tru = pl.numpy_to_matlab(a_tru, ndigits=digits, wtype='f')
            else:
                raise ValueError('method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")' % comparison)

            # FIXME: render correctly with respect to method of comparison
            html_params = {'answer': True, 'label': label, 'a_tru': a_tru}
            with open('pl_matrix_input.mustache', 'r') as f:
                html = chevron.render(f, html_params).strip()
        else:
            html = ''

    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html


def parse(element_html, element_index, data):
    # By convention, this function returns at the first error found

    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data['submitted_answers'].get(name, None)
    if not a_sub:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = None
        return data

    # Replace unicode minus with hyphen minus wherever it occurs
    a_sub = a_sub.replace(u'\u2212', '-')

    # Convert submitted answer to numpy array (return parse_error on failure)
    (a_sub_parsed, parse_error) = pl.matlab_to_numpy(a_sub)
    if a_sub_parsed is None:
        data['format_errors'][name] = parse_error
        data['submitted_answers'][name] = None
        return data

    # Replace submitted answer with numpy array
    data['submitted_answers'][name] = a_sub_parsed.tolist()

    return data


def grade(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')

    # Get weight
    weight = pl.get_integer_attrib(element, 'weight', 1)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = pl.from_json(data['correct_answers'].get(name, None))
    if a_tru is None:
        return data
    # Convert true answer to numpy
    a_tru = np.array(a_tru)
    # Throw an error if true answer is not a 2D numpy array
    if a_tru.ndim != 2:
        raise ValueError('true answer must be a 2D array')

    # Get submitted answer (if it does not exist, score is zero)
    a_sub = data['submitted_answers'].get(name, None)
    if a_sub is None:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
        return data
    # Convert submitted answer to numpy
    a_sub = np.array(a_sub)

    # If true and submitted answers have different shapes, score is zero
    if not (a_sub.shape == a_tru.shape):
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
        return data

    # Get method of comparison, with relabs as default
    comparison = pl.get_string_attrib(element, 'comparison', 'relabs')

    # Compare submitted answer with true answer
    if comparison == 'relabs':
        rtol = pl.get_float_attrib(element, 'rtol', 1e-5)
        atol = pl.get_float_attrib(element, 'atol', 1e-8)
        correct = pl.is_correct_ndarray2D_ra(a_sub, a_tru, rtol, atol)
    elif comparison == 'sigfig':
        digits = pl.get_integer_attrib(element, 'digits', 2)
        eps_digits = pl.get_integer_attrib(element, 'eps_digits', 3)
        correct = pl.is_correct_ndarray2D_sf(a_sub, a_tru, digits, eps_digits)
    elif comparison == 'decdig':
        digits = pl.get_integer_attrib(element, 'digits', 2)
        eps_digits = pl.get_integer_attrib(element, 'eps_digits', 3)
        correct = pl.is_correct_ndarray2D_dd(a_sub, a_tru, digits, eps_digits)
    else:
        raise ValueError('method of comparison "%s" is not valid' % comparison)

    if correct:
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    else:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}

    return data
