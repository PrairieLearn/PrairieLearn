import prairielearn as pl
import lxml.html
from html import escape
import numpy as np
import math
import chevron
import random


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers-name']
    optional_attribs = ['weight', 'label', 'comparison', 'rtol', 'atol', 'digits', 'format-type', 'allow-partial-credit', 'allow-feedback']
    pl.check_attribs(element, required_attribs, optional_attribs)


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    # get the name of the element, in this case, the name of the array
    name = pl.get_string_attrib(element, 'answers-name')
    label = pl.get_string_attrib(element, 'label', None)
    format_type = pl.get_string_attrib(element, 'format-type', 'latex')
    allow_feedback = pl.get_boolean_attrib(element, 'allow-feedback', False)

    if data['panel'] == 'question':
        editable = data['editable']

        # Get true answer
        a_tru = pl.from_json(data['correct_answers'].get(name, None))
        if a_tru is None:
            raise Exception('No value in data["correct_answers"] for variable %s in pl-matrix-component-input element' % name)
        else:
            if np.isscalar(a_tru):
                raise Exception('Value in data["correct_answers"] for variable %s in pl-matrix-component-input element cannot be a scalar.' % name)
            else:
                a_tru = np.array(a_tru)

        if a_tru.ndim != 2:
            raise Exception('Value in data["correct_answers"] for variable %s in pl-matrix-component-input element must be a 2D array.' % name)
        else:
            m, n = np.shape(a_tru)

        # create array of input text boxes in html
        input_array = '<table cellspacing="0">'
        for i in range(m):
            if m == 1:
                input_array += ' <td class="close-left"></td> </tr> '
            elif i == 0:
                input_array += ' <tr> <td class="top-and-left"> </td> '
            elif i == m - 1:
                input_array += ' <tr> <td class="bottom-and-left"> </td> '
            else:
                input_array += ' <tr> <td class="left"> </td> '
            for j in range(n):
                each_entry_name = name + str(n * i + j + 1)
                raw_submitted_answer = data['raw_submitted_answers'].get(each_entry_name, None)
                input_array += ' <td> <input name= "' + each_entry_name + '" type="text" size="8"  '
                if not editable:
                    input_array += ' disabled '
                if raw_submitted_answer is not None:
                    input_array += '  value= "'
                    input_array += escape(raw_submitted_answer)
                input_array += '" /> </td>'
            if m == 1:
                input_array += ' <td class="close-right"></td> </tr> '
            elif i == 0:
                input_array += ' <td class="top-and-right"></td> </tr> '
            elif i == m - 1:
                input_array += ' <td class="bottom-and-right"> </td> </tr>'
            else:
                input_array += ' <td class="right"> </td> </tr>'
        input_array += '</table>'

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

        with open('pl-matrix-component-input.mustache', 'r', encoding='utf-8') as f:
            info = chevron.render(f, info_params).strip()
        with open('pl-matrix-component-input.mustache', 'r', encoding='utf-8') as f:
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
            'inline': True,
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

        with open('pl-matrix-component-input.mustache', 'r', encoding='utf-8') as f:
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
            # If answer is in a format generated by pl.to_json, convert it back to a standard type (otherwise, do nothing)
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

        if allow_feedback:
            partial_score_message = data['partial_scores'].get(name, {'feedback': None})
            feedback_message = partial_score_message.get('feedback', None)
            if feedback_message is not None:
                html_params['feedback_message'] = feedback_message

        with open('pl-matrix-component-input.mustache', 'r', encoding='utf-8') as f:
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

            with open('pl-matrix-component-input.mustache', 'r', encoding='utf-8') as f:
                html = chevron.render(f, html_params).strip()
        else:
            html = ''

    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html


def parse(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')

    # Get true answer
    a_tru = pl.from_json(data['correct_answers'].get(name, None))
    if a_tru is None:
        return
    a_tru = np.array(a_tru)
    if a_tru.ndim != 2:
        raise ValueError('true answer must be a 2D array')
    else:
        m, n = np.shape(a_tru)
        A = np.empty([m, n])

    # Create an array for the submitted answer to be stored in data['submitted_answer'][name]
    # used for display in the answer and submission panels
    for i in range(m):
        for j in range(n):
            each_entry_name = name + str(n * i + j + 1)
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

            # Convert to float
            try:
                a_sub_parsed = pl.string_to_number(a_sub)
                if a_sub_parsed is None:
                    raise ValueError('invalid submitted answer (wrong type)')
                if not np.isfinite(a_sub_parsed):
                    raise ValueError('invalid submitted answer (not finite)')
                data['submitted_answers'][each_entry_name] = pl.to_json(a_sub_parsed)
                A[i, j] = a_sub_parsed

            except Exception:
                data['format_errors'][name] = 'Invalid format. At least one of the submitted answers could not be interpreted as a double-precision floating-point number.'
                data['submitted_answers'][name] = None

    data['submitted_answers'][name] = pl.to_json(A)


def grade(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    allow_partial_credit = pl.get_string_attrib(element, 'allow-partial-credit', False)

    # Get weight
    weight = pl.get_integer_attrib(element, 'weight', 1)

    # Get method of comparison, with relabs as default
    comparison = pl.get_string_attrib(element, 'comparison', 'relabs')
    if comparison == 'relabs':
        rtol = pl.get_float_attrib(element, 'rtol', 1e-2)
        atol = pl.get_float_attrib(element, 'atol', 1e-8)
    elif comparison == 'sigfig':
        digits = pl.get_integer_attrib(element, 'digits', 2)
    elif comparison == 'decdig':
        digits = pl.get_integer_attrib(element, 'digits', 2)
    else:
        raise ValueError('method of comparison "%s" is not valid' % comparison)

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
    else:
        m, n = np.shape(a_tru)

    number_of_correct = 0
    feedback = ''
    for i in range(m):
        for j in range(n):
            each_entry_name = name + str(n * i + j + 1)
            a_sub = data['submitted_answers'].get(each_entry_name, None)
            # Get submitted answer (if it does not exist, score is zero)
            if a_sub is None:
                data['partial_scores'][name] = {'score': 0, 'weight': weight}
                return
            # If submitted answer is in a format generated by pl.to_json, convert it
            # back to a standard type (otherwise, do nothing)
            a_sub = pl.from_json(a_sub)

            # Compare submitted answer with true answer
            if comparison == 'relabs':
                correct = pl.is_correct_scalar_ra(a_sub, a_tru[i, j], rtol, atol)
            elif comparison == 'sigfig':
                correct = pl.is_correct_scalar_sf(a_sub, a_tru[i, j], digits)
            elif comparison == 'decdig':
                correct = pl.is_correct_scalar_dd(a_sub, a_tru[i, j], digits)

            if correct:
                number_of_correct += 1
            else:
                feedback += ' (' + str(i + 1) + ', ' + str(j + 1) + '), '

    if number_of_correct == m * n:
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    else:
        if not allow_partial_credit:
            score_value = 0
        else:
            score_value = number_of_correct / (m * n)
        data['partial_scores'][name] = {'score': score_value, 'weight': weight, 'feedback': feedback}


def test(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', 1)
    allow_partial_credit = pl.get_string_attrib(element, 'allow-partial-credit', False)

    # Get correct answer
    a_tru = data['correct_answers'][name]

    # If correct answer is in a format generated by pl.to_json, convert it
    # back to a standard type (otherwise, do nothing)
    a_tru = pl.from_json(a_tru)

    # Wrap true answer in ndarray (if it already is one, this does nothing)
    a_tru = np.array(a_tru)

    # Throw an error if true answer is not a 2D numpy array
    if a_tru.ndim != 2:
        raise ValueError('true answer must be a 2D array')
    else:
        m, n = np.shape(a_tru)

    result = random.choices(['correct', 'incorrect', 'invalid'], [5, 5, 1])[0]

    number_of_correct = 0
    feedback = ''
    format_errors_feedback = ''
    for i in range(m):
        for j in range(n):
            each_entry_name = name + str(n * i + j + 1)
            if result == 'correct':
                data['raw_submitted_answers'][each_entry_name] = str(a_tru[i, j])
                number_of_correct += 1
            elif result == 'incorrect':
                data['raw_submitted_answers'][each_entry_name] = str(a_tru[i, j] + (random.uniform(1, 10) * random.choice([-1, 1])))
                feedback += ' (' + str(i + 1) + ', ' + str(j + 1) + '), '
            elif result == 'invalid':
                if random.choice([True, False]):
                    data['raw_submitted_answers'][each_entry_name] = '1 + 2'
                    format_errors_feedback += 'Found one invalid submitted answer. '
                else:
                    data['raw_submitted_answers'][name] = ''
                    format_errors_feedback += 'Found a blank answer. '
            else:
                raise Exception('invalid result: %s' % result)

    if number_of_correct == m * n:
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    else:
        if not allow_partial_credit:
            score_value = 0
        else:
            score_value = number_of_correct / (m * n)
            data['partial_scores'][name] = {'score': score_value, 'weight': weight, 'feedback': feedback}
    if format_errors_feedback:
        data['format_errors'][name] = format_errors_feedback
