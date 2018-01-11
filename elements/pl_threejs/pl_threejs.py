import prairielearn as pl
import lxml.html
import chevron
import numpy as np
import json
import base64
import os

def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=['answer_name'], optional_attribs=[])

def q_to_b64(q):
    return base64.b64encode(json.dumps(q).encode('utf-8')).decode()

def b64_to_q(b64):
    return json.loads(base64.b64decode(b64).decode())


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answer_name')

    if data['panel'] == 'question':
        file_name = 'geometry.json'
        base_url = data['options']['client_files_question_url']
        file_url = os.path.join(base_url, file_name)

        html_params = {
            'question': True,
            'answer_name': name,
            'uuid': pl.get_uuid(),
            'quaternion': q_to_b64(data['submitted_answers'].get(name, [0, 0, 0, 1])),
            'obj': file_url
            # 'quaternion': json.dumps(list_to_q(data['submitted_answers'].get(name, [0, 0, 0, 1])))
        }
        with open('pl_threejs.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    elif data['panel'] == 'submission':
        parse_error = data['format_errors'].get(name, None)
        html_params = {
            'submission': True,
            'parse_error': parse_error
        }

        if parse_error is None:
            a_sub = data['submitted_answers'][name]
            html_params['a_sub'] = str(a_sub)
            # '{:.12g}'.format(a_sub)

        with open('pl_threejs.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    else:
        return ''

    return html

def parse(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answer_name')

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data['submitted_answers'].get(name, None)
    if not a_sub:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = None
        return

    # Convert from json to list
    a_sub = b64_to_q(a_sub)

    # Put it into data
    data['submitted_answers'][name] = a_sub

def grade(element_html, element_index, data):
    pass

    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answer_name')

    # Get weight
    weight = pl.get_integer_attrib(element, 'weight', 1)

    # # Get true answer (if it does not exist, create no grade - leave it
    # # up to the question code)
    # a_tru = data['correct_answers'].get(name, None)
    # if a_tru is None:
    #     return
    a_tru = 23

    # Get submitted answer (if it does not exist, score is zero)
    a_sub = data['submitted_answers'].get(name, None)
    if a_sub is None:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
        return

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
    #   because <pl_number_input> accepts double-precision floats, not ints.
    #
    a_sub = np.float64(a_sub)
    a_tru = np.float64(a_tru)

    correct = pl.is_correct_scalar_ra(a_sub, a_tru)

    # # Get method of comparison, with relabs as default
    # comparison = pl.get_string_attrib(element, 'comparison', 'relabs')

    # # Compare submitted answer with true answer
    # if comparison == 'relabs':
    #     rtol = pl.get_float_attrib(element, 'rtol', 1e-2)
    #     atol = pl.get_float_attrib(element, 'atol', 1e-8)
    #     correct = pl.is_correct_scalar_ra(a_sub, a_tru, rtol, atol)
    # elif comparison == 'sigfig':
    #     digits = pl.get_integer_attrib(element, 'digits', 2)
    #     correct = pl.is_correct_scalar_sf(a_sub, a_tru, digits)
    # elif comparison == 'decdig':
    #     digits = pl.get_integer_attrib(element, 'digits', 2)
    #     correct = pl.is_correct_scalar_dd(a_sub, a_tru, digits)
    # else:
    #     raise ValueError('method of comparison "%s" is not valid' % comparison)

    if correct:
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    else:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
