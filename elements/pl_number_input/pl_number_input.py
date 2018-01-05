import lxml.html
from html import escape
import chevron
import to_precision
import math
import prairielearn as pl
import numpy as np


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers_name']
    optional_attribs = ['weight', 'correct_answer', 'label', 'suffix', 'display', 'comparison', 'rtol', 'atol', 'digits']
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, 'answers_name')

    correct_answer = pl.get_float_attrib(element, 'correct_answer', None)
    if correct_answer is not None:
        if name in data['correct_answers']:
            raise Exception('duplicate correct_answers variable name: %s' % name)
        data['correct_answers'][name] = correct_answer


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')
    label = pl.get_string_attrib(element, 'label', None)
    suffix = pl.get_string_attrib(element, 'suffix', None)
    display = pl.get_string_attrib(element, 'display', 'inline')

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
            info_params = {'format': True, 'sigfig': True, 'digits': digits, 'comparison_eps': 0.51*(10**-(digits-1))}
        elif comparison == 'decdig':
            digits = pl.get_integer_attrib(element, 'digits', 2)
            info_params = {'format': True, 'decdig': True, 'digits': digits, 'comparison_eps': 0.51*(10**-(digits-0))}
        else:
            raise ValueError('method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")' % comparison)
        with open('pl_number_input.mustache', 'r', encoding='utf-8') as f:
            info = chevron.render(f, info_params).strip()
        with open('pl_number_input.mustache', 'r', encoding='utf-8') as f:
            info_params.pop('format', None)
            info_params['shortformat'] = True
            shortinfo = chevron.render(f, info_params).strip()

        html_params = {
            'question': True,
            'name': name,
            'label': label,
            'suffix': suffix,
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

        if display == 'inline':
            html_params['inline'] = True
        elif display == 'block':
            html_params['block'] = True
        else:
            raise ValueError('method of display "%s" is not valid (must be "inline", "block", or "display")' % display)
        if raw_submitted_answer is not None:
            html_params['raw_submitted_answer'] = escape(raw_submitted_answer)
        with open('pl_number_input.mustache', 'r', encoding='utf-8') as f:
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
            a_sub = data['submitted_answers'][name]
            html_params['suffix'] = suffix
            html_params['a_sub'] = '{:.12g}'.format(a_sub)
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

        with open('pl_number_input.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    elif data['panel'] == 'answer':
        a_tru = data['correct_answers'].get(name, None)
        if a_tru is not None:

            # Get comparison parameters
            comparison = pl.get_string_attrib(element, 'comparison', 'relabs')
            if comparison == 'relabs':
                rtol = pl.get_float_attrib(element, 'rtol', 1e-2)
                atol = pl.get_float_attrib(element, 'atol', 1e-8)
                # FIXME: render correctly with respect to rtol and atol
                a_tru = '{:.12g}'.format(a_tru)
            elif comparison == 'sigfig':
                digits = pl.get_integer_attrib(element, 'digits', 2)
                a_tru = to_precision.to_precision(a_tru, digits)
            elif comparison == 'decdig':
                digits = pl.get_integer_attrib(element, 'digits', 2)
                a_tru = '{:.{ndigits}f}'.format(a_tru, ndigits=digits)
            else:
                raise ValueError('method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")' % comparison)

            # FIXME: render correctly with respect to method of comparison
            html_params = {'answer': True, 'label': label, 'a_tru': a_tru, 'suffix': suffix}
            with open('pl_number_input.mustache', 'r', encoding='utf-8') as f:
                html = chevron.render(f, html_params).strip()
        else:
            html = ''
    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html


def parse(element_html, element_index, data):
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

    # Convert to float
    try:
        a_sub_float = np.float64(a_sub)
        if not np.isfinite(a_sub_float):
            raise ValueError('submitted answer must be a finite real number but was either "inf" or "nan"')
        data['submitted_answers'][name] = a_sub_float
    except ValueError:
        data['format_errors'][name] = 'Invalid format. The submitted answer could not be interpreted as a double-precision floating-point number.'
        data['submitted_answers'][name] = None


def grade(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')

    # Get weight
    weight = pl.get_integer_attrib(element, 'weight', 1)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = data['correct_answers'].get(name, None)
    if a_tru is None:
        return

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

    # Get method of comparison, with relabs as default
    comparison = pl.get_string_attrib(element, 'comparison', 'relabs')

    # Compare submitted answer with true answer
    if comparison == 'relabs':
        rtol = pl.get_float_attrib(element, 'rtol', 1e-2)
        atol = pl.get_float_attrib(element, 'atol', 1e-8)
        correct = pl.is_correct_scalar_ra(a_sub, a_tru, rtol, atol)
    elif comparison == 'sigfig':
        digits = pl.get_integer_attrib(element, 'digits', 2)
        correct = pl.is_correct_scalar_sf(a_sub, a_tru, digits)
    elif comparison == 'decdig':
        digits = pl.get_integer_attrib(element, 'digits', 2)
        correct = pl.is_correct_scalar_dd(a_sub, a_tru, digits)
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

    # FIXME: randomize tests

    data['raw_submitted_answers'][name] = '%f' % data['correct_answers'][name]
    data['partial_scores'][name] = {'score': 1, 'weight': weight}
