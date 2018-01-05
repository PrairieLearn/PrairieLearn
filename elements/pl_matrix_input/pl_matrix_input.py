import prairielearn as pl
import lxml.html
from html import escape
import numpy as np
import random
import math
import chevron


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers_name']
    optional_attribs = ['weight', 'correct_answer', 'label', 'comparison', 'rtol', 'atol', 'digits']
    pl.check_attribs(element, required_attribs, optional_attribs)


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')
    label = pl.get_string_attrib(element, 'label', None)

    if '_pl_matrix_input_format' in data['submitted_answers']:
        format_type = data['submitted_answers']['_pl_matrix_input_format'].get(name, 'matlab')
    else:
        format_type = 'matlab'

    if data['panel'] == 'question':
        editable = data['editable']
        raw_submitted_answer = data['raw_submitted_answers'].get(name, None)

        # Get comparison parameters and info strings
        comparison = pl.get_string_attrib(element, 'comparison', 'relabs')
        if comparison == 'relabs':
            rtol = pl.get_float_attrib(element, 'rtol', 1e-2)
            atol = pl.get_float_attrib(element, 'atol', 1e-8)
            info_params = {'format': True, 'relabs': True, 'rtol': rtol, 'atol': atol}
        elif comparison == 'sigfig':
            digits = pl.get_integer_attrib(element, 'digits', 2)
            info_params = {'format': True, 'sigfig': True, 'digits': digits, 'comparison_eps': 0.51 * (10**-(digits - 1))}
        elif comparison == 'decdig':
            digits = pl.get_integer_attrib(element, 'digits', 2)
            info_params = {'format': True, 'decdig': True, 'digits': digits, 'comparison_eps': 0.51 * (10**-(digits - 0))}
        else:
            raise ValueError('method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")' % comparison)
        with open('pl_matrix_input.mustache', 'r', encoding='utf-8') as f:
            info = chevron.render(f, info_params).strip()
        with open('pl_matrix_input.mustache', 'r', encoding='utf-8') as f:
            info_params.pop('format', None)
            info_params['shortformat'] = True
            shortinfo = chevron.render(f, info_params).strip()

        html_params = {
            'question': True,
            'name': name,
            'label': label,
            'editable': editable,
            'info': info,
            'shortinfo': shortinfo,
            'uuid': pl.get_uuid()
        }

        partial_score = data['partial_scores'].get(name, {'score': None})
        score = partial_score.get('score', None)
        if score is not None:
            try:
                score = float(score)
                if score >= 1:
                    html_params['correct'] = True
                elif score > 0:
                    html_params['partial'] = math.floor(score * 100)
                else:
                    html_params['incorrect'] = True
            except:
                raise ValueError('invalid score' + score)

        if raw_submitted_answer is not None:
            html_params['raw_submitted_answer'] = escape(raw_submitted_answer)
        with open('pl_matrix_input.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'submission':
        parse_error = data['format_errors'].get(name, None)
        html_params = {
            'submission': True,
            'label': label,
            'parse_error': parse_error,
            'uuid': pl.get_uuid()
        }
        if parse_error is None:
            a_sub = np.array(data['submitted_answers'][name])
            if format_type == 'matlab':
                html_params['a_sub'] = pl.numpy_to_matlab(a_sub, ndigits=12, wtype='g')
            else:
                html_params['a_sub'] = str(np.array(a_sub).tolist())
        else:
            raw_submitted_answer = data['raw_submitted_answers'].get(name, None)
            if raw_submitted_answer is not None:
                html_params['raw_submitted_answer'] = escape(raw_submitted_answer)

        partial_score = data['partial_scores'].get(name, {'score': None})
        score = partial_score.get('score', None)
        if score is not None:
            try:
                score = float(score)
                if score >= 1:
                    html_params['correct'] = True
                elif score > 0:
                    html_params['partial'] = math.floor(score * 100)
                else:
                    html_params['incorrect'] = True
            except:
                raise ValueError('invalid score' + score)

        with open('pl_matrix_input.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'answer':
        # Get true answer - do nothing if it does not exist
        a_tru = pl.from_json(data['correct_answers'].get(name, None))
        if a_tru is not None:
            a_tru = np.array(a_tru)

            # Get comparison parameters
            comparison = pl.get_string_attrib(element, 'comparison', 'relabs')
            if comparison == 'relabs':
                rtol = pl.get_float_attrib(element, 'rtol', 1e-2)
                atol = pl.get_float_attrib(element, 'atol', 1e-8)
                # FIXME: render correctly with respect to rtol and atol
                matlab_data = pl.numpy_to_matlab(a_tru, ndigits=12, wtype='g')
                python_data = str(np.array(a_tru).tolist())
            elif comparison == 'sigfig':
                digits = pl.get_integer_attrib(element, 'digits', 2)
                matlab_data = pl.numpy_to_matlab_sf(a_tru, ndigits=digits)
                python_data = pl.string_from_2darray_sf(a_tru, ndigits=digits)
            elif comparison == 'decdig':
                digits = pl.get_integer_attrib(element, 'digits', 2)
                matlab_data = pl.numpy_to_matlab(a_tru, ndigits=digits, wtype='f')
                python_data = str(np.array(a_tru).round(digits).tolist())
            else:
                raise ValueError('method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")' % comparison)

            html_params = {
                'answer': True,
                'label': label,
                'matlab_data': matlab_data,
                'python_data': python_data,
                'element_index': element_index,
                'uuid': pl.get_uuid()
            }

            if format_type == 'matlab':
                html_params['default_is_matlab'] = True
            else:
                html_params['default_is_python'] = True
            with open('pl_matrix_input.mustache', 'r', encoding='utf-8') as f:
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
        return

    # Replace unicode minus with hyphen minus wherever it occurs
    a_sub = a_sub.replace(u'\u2212', '-')

    # Convert submitted answer to numpy array (return parse_error on failure)
    (a_sub_parsed, info) = pl.string_to_2darray(a_sub)
    if a_sub_parsed is None:
        data['format_errors'][name] = info['format_error']
        data['submitted_answers'][name] = None
        return

    # Replace submitted answer with numpy array
    data['submitted_answers'][name] = a_sub_parsed.tolist()

    # Store format type
    if '_pl_matrix_input_format' not in data['submitted_answers']:
        data['submitted_answers']['_pl_matrix_input_format'] = {}
    data['submitted_answers']['_pl_matrix_input_format'][name] = info['format_type']


def grade(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')

    # Get weight
    weight = pl.get_integer_attrib(element, 'weight', 1)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = pl.from_json(data['correct_answers'].get(name, None))
    if a_tru is None:
        return
    # Convert true answer to numpy
    a_tru = np.array(a_tru)
    # Throw an error if true answer is not a 2D numpy array
    if a_tru.ndim != 2:
        raise ValueError('true answer must be a 2D array')

    # Get submitted answer (if it does not exist, score is zero)
    a_sub = data['submitted_answers'].get(name, None)
    if a_sub is None:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
        return
    # Convert submitted answer to numpy
    a_sub = np.array(a_sub)

    # If true and submitted answers have different shapes, score is zero
    if not (a_sub.shape == a_tru.shape):
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
        return

    # Get method of comparison, with relabs as default
    comparison = pl.get_string_attrib(element, 'comparison', 'relabs')

    # Compare submitted answer with true answer
    if comparison == 'relabs':
        rtol = pl.get_float_attrib(element, 'rtol', 1e-2)
        atol = pl.get_float_attrib(element, 'atol', 1e-8)
        correct = pl.is_correct_ndarray2D_ra(a_sub, a_tru, rtol, atol)
    elif comparison == 'sigfig':
        digits = pl.get_integer_attrib(element, 'digits', 2)
        correct = pl.is_correct_ndarray2D_sf(a_sub, a_tru, digits)
    elif comparison == 'decdig':
        digits = pl.get_integer_attrib(element, 'digits', 2)
        correct = pl.is_correct_ndarray2D_dd(a_sub, a_tru, digits)
    else:
        raise ValueError('method of comparison "%s" is not valid' % comparison)

    if correct:
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    else:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}


def test(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')
    weight = pl.get_integer_attrib(element, 'weight', 1)

    a_tru = np.array(data['correct_answers'][name])

    result = random.choices(['correct', 'incorrect', 'invalid'], [5, 5, 1])[0]
    if random.choice([True, False]):
        # matlab
        if result == 'correct':
            data['raw_submitted_answers'][name] = pl.numpy_to_matlab(a_tru, ndigits=12, wtype='g')
            data['partial_scores'][name] = {'score': 1, 'weight': weight}
        elif result == 'incorrect':
            data['raw_submitted_answers'][name] = pl.numpy_to_matlab(a_tru + random.random(), ndigits=12, wtype='g')
            data['partial_scores'][name] = {'score': 0, 'weight': weight}
        elif result == 'invalid':
            # FIXME: add more invalid expressions, make text of format_errors
            # correct, and randomize
            data['raw_submitted_answers'][name] = '[1, 2, 3]'
            data['format_errors'][name] = 'invalid'
        else:
            raise Exception('invalid result: %s' % result)
    else:
        # python
        if result == 'correct':
            data['raw_submitted_answers'][name] = str(np.array(a_tru).tolist())
            data['partial_scores'][name] = {'score': 1, 'weight': weight}
        elif result == 'incorrect':
            data['raw_submitted_answers'][name] = str(np.array(a_tru + random.random()).tolist())
            data['partial_scores'][name] = {'score': 0, 'weight': weight}
        elif result == 'invalid':
            # FIXME: add more invalid expressions, make text of format_errors
            # correct, and randomize
            data['raw_submitted_answers'][name] = '[[1, 2, 3], [4, 5]]'
            data['format_errors'][name] = 'invalid'
        else:
            raise Exception('invalid result: %s' % result)
