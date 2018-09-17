import lxml.html
from html import escape
import chevron
import math
import prairielearn as pl
import numpy as np
import random


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers-name']
    optional_attribs = ['weight', 'correct-answer', 'label', 'suffix', 'display', 'comparison', 'rtol', 'atol', 'digits', 'allow-complex']
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, 'answers-name')

    correct_answer = pl.get_float_attrib(element, 'correct-answer', None)
    if correct_answer is not None:
        if name in data['correct_answers']:
            raise Exception('duplicate correct_answers variable name: %s' % name)
        data['correct_answers'][name] = correct_answer


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
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
        info_params['allow_complex'] = pl.get_boolean_attrib(element, 'allow-complex', False)
        with open('pl-number-input.mustache', 'r', encoding='utf-8') as f:
            info = chevron.render(f, info_params).strip()
        with open('pl-number-input.mustache', 'r', encoding='utf-8') as f:
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
            except Exception:
                raise ValueError('invalid score' + score)

        if display == 'inline':
            html_params['inline'] = True
        elif display == 'block':
            html_params['block'] = True
        else:
            raise ValueError('method of display "%s" is not valid (must be "inline" or "block")' % display)
        if raw_submitted_answer is not None:
            html_params['raw_submitted_answer'] = escape(raw_submitted_answer)
        with open('pl-number-input.mustache', 'r', encoding='utf-8') as f:
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
            except Exception:
                raise ValueError('invalid score' + score)

        with open('pl-number-input.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    elif data['panel'] == 'answer':
        a_tru = pl.from_json(data['correct_answers'].get(name, None))
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
                a_tru = pl.string_from_number_sigfig(a_tru, digits=digits)
            elif comparison == 'decdig':
                digits = pl.get_integer_attrib(element, 'digits', 2)
                a_tru = '{:.{ndigits}f}'.format(a_tru, ndigits=digits)
            else:
                raise ValueError('method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")' % comparison)

            # FIXME: render correctly with respect to method of comparison
            html_params = {'answer': True, 'label': label, 'a_tru': a_tru, 'suffix': suffix}
            with open('pl-number-input.mustache', 'r', encoding='utf-8') as f:
                html = chevron.render(f, html_params).strip()
        else:
            html = ''
    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    allow_complex = pl.get_boolean_attrib(element, 'allow-complex', False)

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data['submitted_answers'].get(name, None)
    if a_sub is None:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = None
        return

    # Convert to float or complex
    try:
        a_sub_parsed = pl.string_to_number(a_sub, allow_complex=allow_complex)
        if a_sub_parsed is None:
            raise ValueError('invalid submitted answer (wrong type)')
        if not np.isfinite(a_sub_parsed):
            raise ValueError('invalid submitted answer (not finite)')
        data['submitted_answers'][name] = pl.to_json(a_sub_parsed)
    except Exception:
        if allow_complex:
            data['format_errors'][name] = 'Invalid format. The submitted answer could not be interpreted as a double-precision floating-point or complex number.'
        else:
            data['format_errors'][name] = 'Invalid format. The submitted answer could not be interpreted as a double-precision floating-point number.'
        data['submitted_answers'][name] = None


def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')

    # Get weight
    weight = pl.get_integer_attrib(element, 'weight', 1)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = pl.from_json(data['correct_answers'].get(name, None))
    if a_tru is None:
        return

    # Get submitted answer (if it does not exist, score is zero)
    a_sub = data['submitted_answers'].get(name, None)
    if a_sub is None:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
        return
    # If submitted answer is in a format generated by pl.to_json, convert it
    # back to a standard type (otherwise, do nothing)
    a_sub = pl.from_json(a_sub)

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
    #   because <pl-number-input> accepts double-precision floats, not ints.
    #
    if np.iscomplexobj(a_sub) or np.iscomplexobj(a_tru):
        a_sub = np.complex128(a_sub)
        a_tru = np.complex128(a_tru)
    else:
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


def test(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', 1)

    # Get correct answer
    a_tru = data['correct_answers'][name]

    # If correct answer is in a format generated by pl.to_json, convert it
    # back to a standard type (otherwise, do nothing)
    a_tru = pl.from_json(a_tru)

    result = random.choices(['correct', 'incorrect', 'invalid'], [5, 5, 1])[0]
    if result == 'correct':
        data['raw_submitted_answers'][name] = str(a_tru)
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    elif result == 'incorrect':
        data['raw_submitted_answers'][name] = str(a_tru + (random.uniform(1, 10) * random.choice([-1, 1])))
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
    elif result == 'invalid':
        # FIXME: add more invalid expressions, make text of format_errors
        # correct, and randomize
        data['raw_submitted_answers'][name] = '1 + 2'
        data['format_errors'][name] = 'invalid'
    else:
        raise Exception('invalid result: %s' % result)
