import prairielearn as pl
import lxml.html
from html import escape
import numpy as np
import math
import chevron
import random


WEIGHT_DEFAULT = 1
LABEL_DEFAULT = None
COMPARISON_DEFAULT = 'relabs'
RTOL_DEFAULT = 1e-2
ATOL_DEFAULT = 1e-8
DIGITS_DEFAULT = 2
ALLOW_PARTIAL_CREDIT_DEFAULT = False
ALLOW_FRACTIONS_DEFAULT = True


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers-name']
    optional_attribs = ['weight', 'label', 'comparison', 'rtol', 'atol', 'digits', 'allow-partial-credit', 'allow-feedback', 'allow-fractions']
    pl.check_attribs(element, required_attribs, optional_attribs)


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    # get the name of the element, in this case, the name of the array
    name = pl.get_string_attrib(element, 'answers-name')
    label = pl.get_string_attrib(element, 'label', LABEL_DEFAULT)
    allow_partial_credit = pl.get_boolean_attrib(element, 'allow-partial-credit', ALLOW_PARTIAL_CREDIT_DEFAULT)
    allow_feedback = pl.get_boolean_attrib(element, 'allow-feedback', allow_partial_credit)
    allow_fractions = pl.get_boolean_attrib(element, 'allow-fractions', ALLOW_FRACTIONS_DEFAULT)

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

        input_array = createTableForHTMLDisplay(m, n, name, label, data, 'input')

        # Get comparison parameters and info strings
        comparison = pl.get_string_attrib(element, 'comparison', COMPARISON_DEFAULT)
        if comparison == 'relabs':
            rtol = pl.get_float_attrib(element, 'rtol', RTOL_DEFAULT)
            atol = pl.get_float_attrib(element, 'atol', ATOL_DEFAULT)
            if (rtol < 0):
                raise ValueError('Attribute rtol = {:g} must be non-negative'.format(rtol))
            if (atol < 0):
                raise ValueError('Attribute atol = {:g} must be non-negative'.format(atol))
            info_params = {'format': True, 'relabs': True, 'rtol': '{:g}'.format(rtol), 'atol': '{:g}'.format(atol)}
        elif comparison == 'sigfig':
            digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
            if (digits < 0):
                raise ValueError('Attribute digits = {:d} must be non-negative'.format(digits))
            info_params = {'format': True, 'sigfig': True, 'digits': '{:d}'.format(digits), 'comparison_eps': 0.51 * (10**-(digits - 1))}
        elif comparison == 'decdig':
            digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
            if (digits < 0):
                raise ValueError('Attribute digits = {:d} must be non-negative'.format(digits))
            info_params = {'format': True, 'decdig': True, 'digits': '{:d}'.format(digits), 'comparison_eps': 0.51 * (10**-(digits - 0))}
        else:
            raise ValueError('method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")' % comparison)

        info_params['allow_fractions'] = allow_fractions
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

        a_tru = pl.from_json(data['correct_answers'].get(name, None))
        m, n = np.shape(a_tru)

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

        if parse_error is None and name in data['submitted_answers']:
            # Get submitted answer, raising an exception if it does not exist
            a_sub = data['submitted_answers'].get(name, None)
            if a_sub is None:
                raise Exception('submitted answer is None')
            # If answer is in a format generated by pl.to_json, convert it back to a standard type (otherwise, do nothing)
            a_sub = pl.from_json(a_sub)
            # Wrap answer in an ndarray (if it's already one, this does nothing)
            a_sub = np.array(a_sub)
            # Format submitted answer as a latex string
            sub_latex = '$' + pl.latex_from_2darray(a_sub, presentation_type='g', digits=12) + '$'
            # When allowing feedback, display submitted answers using html table
            sub_html_table = createTableForHTMLDisplay(m, n, name, label, data, 'output-feedback')
            if allow_feedback and score is not None:
                if score < 1:
                    html_params['a_sub_feedback'] = sub_html_table
                else:
                    html_params['a_sub'] = sub_latex
            else:
                html_params['a_sub'] = sub_latex
        elif name not in data['submitted_answers']:
            html_params['missing_input'] = True
            html_params['parse_error'] = None
        else:
            # create html table to show submitted answer when there is an invalid format
            html_params['raw_submitted_answer'] = createTableForHTMLDisplay(m, n, name, label, data, 'output-invalid')

        html_params['error'] = html_params['parse_error'] or html_params.get('missing_input', False)

        with open('pl-matrix-component-input.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'answer':

        # Get true answer - do nothing if it does not exist
        a_tru = pl.from_json(data['correct_answers'].get(name, None))
        if a_tru is not None:
            a_tru = np.array(a_tru)

            # Get comparison parameters and create the display data
            comparison = pl.get_string_attrib(element, 'comparison', COMPARISON_DEFAULT)
            if comparison == 'relabs':
                rtol = pl.get_float_attrib(element, 'rtol', RTOL_DEFAULT)
                atol = pl.get_float_attrib(element, 'atol', ATOL_DEFAULT)
                # FIXME: render correctly with respect to rtol and atol
                latex_data = '$' + pl.latex_from_2darray(a_tru, presentation_type='g', digits=12) + '$'
            elif comparison == 'sigfig':
                digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
                latex_data = '$' + pl.latex_from_2darray(a_tru, presentation_type='sigfig', digits=digits) + '$'
            elif comparison == 'decdig':
                digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
                latex_data = '$' + pl.latex_from_2darray(a_tru, presentation_type='f', digits=digits) + '$'
            else:
                raise ValueError('method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")' % comparison)

            html_params = {
                'answer': True,
                'label': label,
                'latex_data': latex_data,
                'uuid': pl.get_uuid()
            }

            with open('pl-matrix-component-input.mustache', 'r', encoding='utf-8') as f:
                html = chevron.render(f, html_params).strip()
        else:
            html = ''

    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html


def parse_entry(name, data, allow_fractions):
    parsed = 0.0
    valid = False

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data['submitted_answers'].get(name, None)
    if a_sub is None:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = None
        return (parsed, valid)

    if a_sub.strip() == '':
        data['format_errors'][name] = 'Answer was blank.'
        data['submitted_answers'][name] = None
        return (parsed, valid)

    # support FANCY division characters
    a_sub = a_sub.replace(u'\u2215', '/')  # unicode /
    a_sub = a_sub.replace(u'\u00F7', '/')  # division symbol, because why not

    if a_sub.count('/') == 1:
        # Specially handle fractions.

        if allow_fractions:
            a_sub_splt = a_sub.split('/')
            try:
                a_parse_l = pl.string_to_number(a_sub_splt[0], allow_complex=False)
                a_parse_r = pl.string_to_number(a_sub_splt[1], allow_complex=False)

                if a_parse_l is None or not np.isfinite(a_parse_l):
                    raise ValueError('the numerator could not be interpreted as a decimal number.')
                if a_parse_r is None or not np.isfinite(a_parse_r):
                    raise ValueError('the denominator could not be interpreted as a decimal number.')

                a_frac = a_parse_l / a_parse_r
                if not np.isfinite(a_frac):
                    raise ValueError('The submitted answer is not a finite number.')

                parsed = pl.to_json(a_frac)
                data['submitted_answers'][name] = parsed
                valid = True
            except ZeroDivisionError:
                data['format_errors'][name] = '(Division by zero)'
                data['submitted_answers'][name] = None
            except Exception as error:
                data['format_errors'][name] = f'(Invalid format - {str(error)})'
                data['submitted_answers'][name] = None
        else:
            data['format_errors'][name] = '(No fractional answers)'
            data['submitted_answers'][name] = None
    else:
        # Not a fraction, just convert to float or complex
        try:
            a_sub_parsed = pl.string_to_number(a_sub, allow_complex=False)
            if a_sub_parsed is None:
                raise ValueError('invalid submitted answer (wrong type)')
            if not np.isfinite(a_sub_parsed):
                raise ValueError('invalid submitted answer (not finite)')
            data['submitted_answers'][name] = pl.to_json(a_sub_parsed)
            valid = True
        except Exception as error:
            data['format_errors'][name] = f'(Invalid format - {str(error)})'
            data['submitted_answers'][name] = None

    return (parsed, valid)


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    allow_fractions = pl.get_boolean_attrib(element, 'allow-fractions', ALLOW_FRACTIONS_DEFAULT)

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
    # Also creates invalid error messages
    invalid_format = False
    for i in range(m):
        for j in range(n):
            each_entry_name = name + str(n * i + j + 1)
            value, valid = parse_entry(each_entry_name, data, allow_fractions)
            if valid:
                A[i, j] = value
            else:
                invalid_format = True

    if invalid_format:
        with open('pl-matrix-component-input.mustache', 'r', encoding='utf-8') as f:
            data['format_errors'][name] = chevron.render(f, {'format_error': True, 'allow_fractions': allow_fractions}).strip()
        data['submitted_answers'][name] = None
    else:
        data['submitted_answers'][name] = pl.to_json(A)


def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    allow_partial_credit = pl.get_boolean_attrib(element, 'allow-partial-credit', ALLOW_PARTIAL_CREDIT_DEFAULT)

    # Get weight
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)

    # Get method of comparison, with relabs as default
    comparison = pl.get_string_attrib(element, 'comparison', COMPARISON_DEFAULT)
    if comparison == 'relabs':
        rtol = pl.get_float_attrib(element, 'rtol', RTOL_DEFAULT)
        atol = pl.get_float_attrib(element, 'atol', ATOL_DEFAULT)
    elif comparison == 'sigfig':
        digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
    elif comparison == 'decdig':
        digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
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
    feedback = {}
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
                feedback.update({each_entry_name: 'correct'})
            else:
                feedback.update({each_entry_name: 'incorrect'})

    if number_of_correct == m * n:
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    else:
        if not allow_partial_credit:
            score_value = 0
        else:
            score_value = number_of_correct / (m * n)
        data['partial_scores'][name] = {'score': score_value, 'weight': weight, 'feedback': feedback}


def test(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)
    allow_partial_credit = pl.get_boolean_attrib(element, 'allow-partial-credit', ALLOW_PARTIAL_CREDIT_DEFAULT)

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

    result = random.choices(['correct', 'incorrect', 'incorrect'], [5, 5, 1])[0]

    number_of_correct = 0
    feedback = {}
    for i in range(m):
        for j in range(n):
            each_entry_name = name + str(n * i + j + 1)

            if result == 'correct':
                data['raw_submitted_answers'][each_entry_name] = str(a_tru[i, j])
                number_of_correct += 1
                feedback.update({each_entry_name: 'correct'})
            elif result == 'incorrect':
                data['raw_submitted_answers'][each_entry_name] = str(a_tru[i, j] + (random.uniform(1, 10) * random.choice([-1, 1])))
                feedback.update({each_entry_name: 'incorrect'})
            elif result == 'invalid':
                if random.choice([True, False]):
                    data['raw_submitted_answers'][each_entry_name] = '1,2'
                    data['format_errors'][each_entry_name] = '(Invalid format)'
                else:
                    data['raw_submitted_answers'][name] = ''
                    data['format_errors'][each_entry_name] = '(Invalid blank entry)'
            else:
                raise Exception('invalid result: %s' % result)

    if result == 'invalid':
        data['format_errors'][name] = 'At least one of the entries has invalid format (empty entries or not a double precision floating point number)'

    if number_of_correct == m * n:
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    else:
        if not allow_partial_credit:
            score_value = 0
        else:
            score_value = number_of_correct / (m * n)
        data['partial_scores'][name] = {'score': score_value, 'weight': weight, 'feedback': feedback}


def createTableForHTMLDisplay(m, n, name, label, data, format):

    editable = data['editable']

    if format == 'output-invalid':

        display_array = '<table>'
        display_array += '<tr>'
        display_array += '<td class="close-left" rowspan="' + str(m) + '"></td>'
        display_array += '<td style="width:4px" rowspan="' + str(m) + '"></td>'
        # First row of array
        for j in range(n):
            each_entry_name = name + str(j + 1)
            raw_submitted_answer = data['raw_submitted_answers'].get(each_entry_name, None)
            format_errors = data['format_errors'].get(each_entry_name, None)
            if format_errors is None:
                display_array += '<td class="allborder"><code class="user-output">'
            else:
                display_array += '<td class="allborder"><code class="user-output-invalid">'
            display_array += escape(pl.escape_unicode_string(raw_submitted_answer))
            display_array += '</code></td> '
        display_array += '<td style="width:4px" rowspan="' + str(m) + '"></td>'
        display_array += '<td class="close-right" rowspan="' + str(m) + '"></td>'
        # Add the other rows
        for i in range(1, m):
            display_array += ' <tr>'
            for j in range(n):
                each_entry_name = name + str(n * i + j + 1)
                raw_submitted_answer = data['raw_submitted_answers'].get(each_entry_name, None)
                format_errors = data['format_errors'].get(each_entry_name, None)
                if format_errors is None:
                    display_array += '<td class="allborder"><code class="user-output">'
                else:
                    display_array += '<td class="allborder"><code class="user-output-invalid">'
                display_array += escape(pl.escape_unicode_string(raw_submitted_answer))
                display_array += '</code></td> '
            display_array += '</tr>'
        display_array += '</table>'

    elif format == 'output-feedback':

        partial_score_feedback = data['partial_scores'].get(name, {'feedback': None})
        feedback_each_entry = partial_score_feedback.get('feedback', None)
        score = partial_score_feedback.get('score', None)

        if score is not None:
            score = float(score)
            if score >= 1:
                score_message = '&nbsp;<span class="badge badge-success"><i class="fa fa-check" aria-hidden="true"></i> 100%</span>'
            elif score > 0:
                score_message = '&nbsp;<span class="badge badge-warning"><i class="far fa-circle" aria-hidden="true"></i>' + str(math.floor(score * 100)) + '%</span>'
            else:
                score_message = '&nbsp;<span class="badge badge-danger"><i class="fa fa-times" aria-hidden="true"></i> 0%</span>'
        else:
            score_message = ''

        display_array = '<table>'
        display_array += '<tr>'
        # Add the prefix
        if label is not None:
            display_array += '<td rowspan="0">' + label + '&nbsp;</td>'
        display_array += '<td class="close-left" rowspan="' + str(m) + '"></td>'
        display_array += '<td style="width:4px" rowspan="' + str(m) + '"></td>'
        # First row of array
        for j in range(n):
            each_entry_name = name + str(j + 1)
            raw_submitted_answer = data['raw_submitted_answers'].get(each_entry_name, None)
            display_array += '<td class="allborder">'
            display_array += escape(raw_submitted_answer)
            if feedback_each_entry is not None:
                if feedback_each_entry[each_entry_name] == 'correct':
                    feedback_message = '&nbsp;<span class="badge badge-success"><i class="fa fa-check" aria-hidden="true"></i></span>'
                elif feedback_each_entry[each_entry_name] == 'incorrect':
                    feedback_message = '&nbsp;<span class="badge badge-danger"><i class="fa fa-times" aria-hidden="true"></i></span>'
                display_array += feedback_message
            display_array += '</td> '
        # Add the suffix
        display_array += '<td style="width:4px" rowspan="' + str(m) + '"></td>'
        display_array += '<td class="close-right" rowspan="' + str(m) + '"></td>'
        if score_message is not None:
            display_array += '<td rowspan="0">&nbsp;' + score_message + '</td>'
        display_array += '</tr>'
        # Add the other rows
        for i in range(1, m):
            display_array += ' <tr>'
            for j in range(n):
                each_entry_name = name + str(n * i + j + 1)
                raw_submitted_answer = data['raw_submitted_answers'].get(each_entry_name, None)
                display_array += ' <td class="allborder"> '
                display_array += escape(raw_submitted_answer)
                if feedback_each_entry is not None:
                    if feedback_each_entry[each_entry_name] == 'correct':
                        feedback_message = '&nbsp;<span class="badge badge-success"><i class="fa fa-check" aria-hidden="true"></i></span>'
                    elif feedback_each_entry[each_entry_name] == 'incorrect':
                        feedback_message = '&nbsp;<span class="badge badge-danger"><i class="fa fa-times" aria-hidden="true"></i></span>'
                    display_array += feedback_message
                display_array += ' </td> '
            display_array += '</tr>'
        display_array += '</table>'

    elif format == 'input':
        display_array = '<table>'
        display_array += '<tr>'
        # Add first row
        display_array += '<td class="close-left" rowspan="' + str(m) + '"></td>'
        display_array += '<td style="width:4px" rowspan="' + str(m) + '"></td>'
        for j in range(n):
            each_entry_name = name + str(j + 1)
            raw_submitted_answer = data['raw_submitted_answers'].get(each_entry_name, None)
            display_array += ' <td> <input name= "' + each_entry_name + '" type="text" size="8"  '
            if not editable:
                display_array += ' disabled '
            if raw_submitted_answer is not None:
                display_array += '  value= "'
                display_array += escape(raw_submitted_answer)
            display_array += '" /> </td>'
        display_array += '<td style="width:4px" rowspan="' + str(m) + '"></td>'
        display_array += '<td class="close-right" rowspan="' + str(m) + '"></td>'
        # Add other rows
        for i in range(1, m):
            display_array += ' <tr>'
            for j in range(n):
                each_entry_name = name + str(n * i + j + 1)
                raw_submitted_answer = data['raw_submitted_answers'].get(each_entry_name, None)
                display_array += ' <td> <input name= "' + each_entry_name + '" type="text" size="8"  '
                if not editable:
                    display_array += ' disabled '
                if raw_submitted_answer is not None:
                    display_array += '  value= "'
                    display_array += escape(raw_submitted_answer)
                display_array += '" /> </td>'
                display_array += ' </td> '
            display_array += '</tr>'
        display_array += '</table>'

    else:

        display_array = ''

    return display_array
