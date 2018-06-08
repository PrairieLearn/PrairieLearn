import prairielearn as pl
import to_precision
import lxml.html
from html import escape
import numpy as np
import random
import math
import chevron


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers_name']
    optional_attribs = ['weight', 'label', 'comparison', 'rtol', 'atol', 'digits', 'allow_complex', 'format_type']
    pl.check_attribs(element, required_attribs, optional_attribs)


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    # get the name of the element, in this case, the name of the array
    name = pl.get_string_attrib(element, 'answers_name')
    label = pl.get_string_attrib(element, 'label', None)
    format_type = pl.get_string_attrib(element, 'format_type', 'latex')

    if data['panel'] == 'question':
        editable = data['editable']

        # Get true answer
        a_tru = pl.from_json(data['correct_answers'].get(name, None))
        if a_tru is None:
            raise Exception('No value in data["correct_answers"] for variable %s in pl_matrix_component_input element' % name)
        else:
            if np.isscalar(a_tru):
                raise Exception('Value in data["correct_answers"] for variable %s in pl_matrix_component_input element cannot be a scalar.' % name)
            else:
                a_tru = np.array(a_tru)

        if a_tru.ndim != 2:
            raise Exception('Value in data["correct_answers"] for variable %s in pl_matrix_component_input element must be a 2D array.' % name)
        else:
            m,n = np.shape(a_tru)

        # create array of input text boxes in html
        input_array = '<div>'
        for i in range(m):
            for j in range(n):
                each_entry_name = 'name' + str(n*i+j+1)
                raw_submitted_answer = data['raw_submitted_answers'].get(each_entry_name, None)
                input_array += ' <input name= "' + each_entry_name +  '" type="text" size="8"  '
                if not editable:
                    input_array += ' disabled '
                if raw_submitted_answer is not None:
                    input_array += '  value= "'
                    input_array += escape(raw_submitted_answer)
                input_array += '" /> '
            input_array += '<br>'
        input_array += '</div>'

        # Get comparison parameters and info strings
        comparison = pl.get_string_attrib(element, 'comparison', 'relabs')
        if comparison == 'relabs':
            rtol = pl.get_float_attrib(element, 'rtol', 1e-2)
            atol = pl.get_float_attrib(element, 'atol', 1e-8)
            if (rtol < 0):
                raise ValueError('Attribute rtol = {:g} must be non-negative'.format(rtol))
            if (atol < 0):
                raise ValueError('Attribute atol = {:g} must be non-negative'.format(atol))
            info_params = {'format': True, 'relabs': True, 'rtol': '{:g}'.format(rtol), 'atol': '{:g}'.format(atol)}
        elif comparison == 'sigfig':
            digits = pl.get_integer_attrib(element, 'digits', 2)
            if (digits < 0):
                raise ValueError('Attribute digits = {:d} must be non-negative'.format(digits))
            info_params = {'format': True, 'sigfig': True, 'digits': '{:d}'.format(digits), 'comparison_eps': 0.51 * (10**-(digits - 1))}
        elif comparison == 'decdig':
            digits = pl.get_integer_attrib(element, 'digits', 2)
            if (digits < 0):
                raise ValueError('Attribute digits = {:d} must be non-negative'.format(digits))
            info_params = {'format': True, 'decdig': True, 'digits': '{:d}'.format(digits), 'comparison_eps': 0.51 * (10**-(digits - 0))}
        else:
            raise ValueError('method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")' % comparison)

        # check if entries are complex numbers
        info_params['allow_complex'] = pl.get_boolean_attrib(element, 'allow_complex', False)

        with open('pl_matrix_component_input.mustache', 'r', encoding='utf-8') as f:
            info = chevron.render(f, info_params).strip()
        with open('pl_matrix_component_input.mustache', 'r', encoding='utf-8') as f:
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
            'input_array': input_array,
            'inline': True, # only option to diplay inline
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
            except Exception:
                raise ValueError('invalid score' + score)

        with open('pl_matrix_component_input.mustache', 'r', encoding='utf-8') as f:
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
            # Get submitted answer, raising an exception if it does not exist
            a_sub = data['submitted_answers'].get(name, None)
            if a_sub is None:
                raise Exception('submitted answer is None')
            # If answer is in a format generated by pl.to_json, convert it
            # back to a standard type (otherwise, do nothing)
            a_sub = pl.from_json(a_sub)

            # Wrap answer in an ndarray (if it's already one, this does nothing)
            a_sub = np.array(a_sub)

            # Format answer as a string
            if format_type == 'python':
                html_params['a_sub'] = pl.string_from_2darray(a_sub, language='python', digits=12, presentation_type='g')
            else:
                html_params['a_sub'] = '$' + pl.latex_array_from_numpy_array(a_sub, presentation_type='g', digits=12) + '$'


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
            except Exception:
                raise ValueError('invalid score' + score)

        with open('pl_matrix_component_input.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()


    elif data['panel'] == 'answer':
        # Get true answer - do nothing if it does not exist
        a_tru = pl.from_json(data['correct_answers'].get(name, None))
        if a_tru is not None:
            a_tru = np.array(a_tru)

            # Get comparison parameters and create the display data (python or latex format)
            comparison = pl.get_string_attrib(element, 'comparison', 'relabs')
            if comparison == 'relabs':
                rtol = pl.get_float_attrib(element, 'rtol', 1e-2)
                atol = pl.get_float_attrib(element, 'atol', 1e-8)
                # FIXME: render correctly with respect to rtol and atol
                python_data = pl.string_from_2darray(a_tru, language='python', digits=12, presentation_type='g')
                latex_data = '$' + pl.latex_array_from_numpy_array(a_tru, presentation_type='g', digits=12) + '$'
            elif comparison == 'sigfig':
                digits = pl.get_integer_attrib(element, 'digits', 2)
                python_data = pl.string_from_2darray(a_tru, language='python', digits=digits, presentation_type='sigfig')
                latex_data = '$' + pl.latex_array_from_numpy_array(a_tru, presentation_type='sigfig', digits=digits) + '$'
            elif comparison == 'decdig':
                digits = pl.get_integer_attrib(element, 'digits', 2)
                python_data = pl.string_from_2darray(a_tru, language='python', digits=digits, presentation_type='f')
                latex_data = '$' + pl.latex_array_from_numpy_array(a_tru, presentation_type='f', digits=digits) + '$'
            else:
                raise ValueError('method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")' % comparison)

            html_params = {
                'answer': True,
                'label': label,
                'python_data': python_data,
                'latex_data': latex_data,
                'element_index': element_index,
                'uuid': pl.get_uuid()
            }

            if format_type == 'python':
                html_params['default_is_python'] = True
            else:
                html_params['default_is_latex'] = True

            with open('pl_matrix_component_input.mustache', 'r', encoding='utf-8') as f:
                html = chevron.render(f, html_params).strip()
        else:
            html = ''


    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html



def parse(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')
    allow_complex = pl.get_boolean_attrib(element, 'allow_complex', False)

    # Get true answer
    a_tru = pl.from_json(data['correct_answers'].get(name, None))
    if a_tru is None:
        return
    a_tru = np.array(a_tru)
    if a_tru.ndim != 2:
        raise ValueError('true answer must be a 2D array')
    else:
        m,n = np.shape(a_tru)
        A = np.empty([m,n])

    # Create an array for the submitted answer
    # to be stored in data['submitted_answer'][name]
    # this is used for display in the answer and submission panels

    for i in range(m):
        for j in range(n):
            each_entry_name = 'name' + str(n*i+j+1)
            a_sub = data['submitted_answers'].get(each_entry_name, None)

            if a_sub is None:
                data['format_errors'][name] = 'No submitted answer.'
                data['submitted_answers'][name] = None
                return
            # check if one of the entries was left blank
            if not a_sub:
                data['format_errors'][name] = 'At least one of the matrix entries was left blank.  Make sure you are entering all matrix components.'
                data['submitted_answers'][name] = None
                return

            # Convert to float or complex
            try:
                a_sub_parsed = pl.string_to_number(a_sub, allow_complex=allow_complex)
                if a_sub_parsed is None:
                    raise ValueError('invalid submitted answer (wrong type)')
                if not np.isfinite(a_sub_parsed):
                    raise ValueError('invalid submitted answer (not finite)')
                data['submitted_answers'][each_entry_name] = pl.to_json(a_sub_parsed)
                A[i,j] = a_sub_parsed

            except Exception:
                if allow_complex:
                    data['format_errors'][name] = 'Invalid format. At least one of the submitted answers could not be interpreted as a double-precision floating-point or complex number.'
                else:
                    data['format_errors'][name] = 'Invalid format. At least one of the submitted answers could not be interpreted as a double-precision floating-point number.'
                data['submitted_answers'][name] = None

    data['submitted_answers'][name] = pl.to_json(A)


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
    # Wrap true answer in ndarray (if it already is one, this does nothing)
    a_tru = np.array(a_tru)
    # Throw an error if true answer is not a 2D numpy array
    if a_tru.ndim != 2:
        raise ValueError('true answer must be a 2D array')

    # Get submitted answer (if it does not exist, score is zero)
    a_sub = data['submitted_answers'].get(name, None)
    if a_sub is None:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
        return
    # If submitted answer is in a format generated by pl.to_json, convert it
    # back to a standard type (otherwise, do nothing)
    a_sub = pl.from_json(a_sub)
    # Wrap submitted answer in an ndarray (if it's already one, this does nothing)
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
