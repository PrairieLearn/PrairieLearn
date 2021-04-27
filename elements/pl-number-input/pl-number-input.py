import lxml.html
from html import escape
import chevron
import math
import prairielearn as pl
import numpy as np
import random


RTOL_DEFAULT = 1e-2
ATOL_DEFAULT = 1e-8
SIZE_DEFAULT = 35
DIGITS_DEFAULT = 2
WEIGHT_DEFAULT = 1
DISPLAY_DEFAULT = 'inline'
COMPARISON_DEFAULT = 'relabs'
ALLOW_COMPLEX_DEFAULT = False
SHOW_HELP_TEXT_DEFAULT = True
SHOW_PLACEHOLDER_DEFAULT = True
SHOW_CORRECT_ANSWER_DEFAULT = True
ALLOW_FRACTIONS_DEFAULT = True
ALLOW_BLANK_DEFAULT = False
BLANK_VALUE_DEFAULT = 0


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers-name']
    optional_attribs = ['weight', 'correct-answer', 'label', 'suffix', 'display', 'comparison', 'rtol', 'atol', 'digits', 'allow-complex', 'show-help-text', 'size', 'show-correct-answer', 'show-placeholder', 'allow-fractions', 'allow-blank', 'blank-value']
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, 'answers-name')

    correct_answer = pl.get_float_attrib(element, 'correct-answer', None)
    if correct_answer is not None:
        if name in data['correct_answers']:
            raise Exception('duplicate correct_answers variable name: %s' % name)
        data['correct_answers'][name] = correct_answer


def format_true_ans(element, data, name):
    a_tru = pl.from_json(data['correct_answers'].get(name, None))
    if a_tru is not None:
        # Get comparison parameters
        comparison = pl.get_string_attrib(element, 'comparison', COMPARISON_DEFAULT)
        if comparison == 'relabs':
            # FIXME: render correctly with respect to rtol and atol
            a_tru = '{:.12g}'.format(a_tru)
        elif comparison == 'sigfig':
            digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
            a_tru = pl.string_from_number_sigfig(a_tru, digits=digits)
        elif comparison == 'decdig':
            digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
            a_tru = '{:.{ndigits}f}'.format(a_tru, ndigits=digits)
        else:
            raise ValueError('method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")' % comparison)
    return a_tru


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    label = pl.get_string_attrib(element, 'label', None)
    suffix = pl.get_string_attrib(element, 'suffix', None)
    display = pl.get_string_attrib(element, 'display', DISPLAY_DEFAULT)
    allow_fractions = pl.get_boolean_attrib(element, 'allow-fractions', ALLOW_FRACTIONS_DEFAULT)

    if data['panel'] == 'question':
        editable = data['editable']
        raw_submitted_answer = data['raw_submitted_answers'].get(name, None)

        html_params = {
            'question': True,
            'name': name,
            'label': label,
            'suffix': suffix,
            'editable': editable,
            'size': pl.get_integer_attrib(element, 'size', SIZE_DEFAULT),
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

        # Update parameters for the info popup
        show_correct = 'correct' in html_params and pl.get_boolean_attrib(element, 'show-correct-answer', SHOW_CORRECT_ANSWER_DEFAULT)
        info_params['allow_complex'] = pl.get_boolean_attrib(element, 'allow-complex', ALLOW_COMPLEX_DEFAULT)
        info_params['show_info'] = pl.get_boolean_attrib(element, 'show-help-text', SHOW_HELP_TEXT_DEFAULT)
        info_params['show_correct'] = show_correct
        info_params['allow_fractions'] = allow_fractions

        # Find the true answer to be able to display it in the info popup
        ans_true = None
        if pl.get_boolean_attrib(element, 'show-correct-answer', SHOW_CORRECT_ANSWER_DEFAULT):
            ans_true = format_true_ans(element, data, name)
        if ans_true is not None:
            info_params['a_tru'] = ans_true

        with open('pl-number-input.mustache', 'r', encoding='utf-8') as f:
            info = chevron.render(f, info_params).strip()
        with open('pl-number-input.mustache', 'r', encoding='utf-8') as f:
            info_params.pop('format', None)
            # Within mustache, the shortformat generates the shortinfo that is used as a placeholder inside of the numeric entry.
            # Here we opt to not generate the value, hence the placeholder is empty.
            info_params['shortformat'] = pl.get_boolean_attrib(element, 'show-placeholder', SHOW_PLACEHOLDER_DEFAULT)
            shortinfo = chevron.render(f, info_params).strip()

        html_params['info'] = info
        html_params['shortinfo'] = shortinfo

        # Determine the title of the popup based on what information is being shown
        if pl.get_boolean_attrib(element, 'show-help-text', SHOW_HELP_TEXT_DEFAULT):
            html_params['popup_title'] = 'Number'
        else:
            html_params['popup_title'] = 'Correct Answer'

        # Enable or disable the popup
        if pl.get_boolean_attrib(element, 'show-help-text', SHOW_HELP_TEXT_DEFAULT) or show_correct:
            html_params['show_info'] = True
        html_params['display_append_span'] = 'show_info' in html_params or suffix

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

        if parse_error is None and name in data['submitted_answers']:
            a_sub = data['submitted_answers'].get(name)
            # If answer is in a format generated by pl.to_json, convert it
            # back to a standard type (otherwise, do nothing)
            a_sub = pl.from_json(a_sub)

            html_params['suffix'] = suffix
            html_params['a_sub'] = '{:.12g}'.format(a_sub)
        elif name not in data['submitted_answers']:
            html_params['missing_input'] = True
            html_params['parse_error'] = None
        else:
            raw_submitted_answer = data['raw_submitted_answers'].get(name, None)
            if raw_submitted_answer is not None:
                html_params['raw_submitted_answer'] = pl.escape_unicode_string(raw_submitted_answer)

        # Add true answer to be able to display it in the submitted answer panel
        ans_true = None
        if pl.get_boolean_attrib(element, 'show-correct-answer', SHOW_CORRECT_ANSWER_DEFAULT):
            ans_true = format_true_ans(element, data, name)
        if ans_true is not None:
            html_params['a_tru'] = ans_true

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

        html_params['error'] = html_params['parse_error'] or html_params.get('missing_input', False)

        with open('pl-number-input.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    elif data['panel'] == 'answer':
        ans_true = None
        if pl.get_boolean_attrib(element, 'show-correct-answer', SHOW_CORRECT_ANSWER_DEFAULT):
            ans_true = format_true_ans(element, data, name)

        if ans_true is not None:
            html_params = {'answer': True, 'label': label, 'a_tru': ans_true, 'suffix': suffix}
            with open('pl-number-input.mustache', 'r', encoding='utf-8') as f:
                html = chevron.render(f, html_params).strip()
        else:
            html = ''
    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html


def get_format_string(is_complex=False, allow_fractions=False, message=None):
    params = {
        'complex': is_complex,
        'format_error': True,
        'allow_fractions': allow_fractions,
        'format_error_message': message
    }
    with open('pl-number-input.mustache', 'r', encoding='utf-8') as f:
        return chevron.render(f, params).strip()


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    allow_complex = pl.get_boolean_attrib(element, 'allow-complex', ALLOW_COMPLEX_DEFAULT)
    allow_fractions = pl.get_boolean_attrib(element, 'allow-fractions', ALLOW_FRACTIONS_DEFAULT)
    allow_blank = pl.get_boolean_attrib(element, 'allow-blank', ALLOW_BLANK_DEFAULT)
    blank_value = pl.get_string_attrib(element, 'blank-value', str(BLANK_VALUE_DEFAULT))

    a_sub = data['submitted_answers'].get(name, None)
    if allow_blank and a_sub is not None and a_sub.strip() == '':
        a_sub = blank_value
    value, newdata = pl.string_fraction_to_number(a_sub, allow_fractions, allow_complex)

    if value is not None:
        data['submitted_answers'][name] = newdata['submitted_answers']
    else:
        data['format_errors'][name] = get_format_string(allow_complex, allow_fractions, newdata['format_errors'])
        data['submitted_answers'][name] = None


def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')

    # Get weight
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)

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
    comparison = pl.get_string_attrib(element, 'comparison', COMPARISON_DEFAULT)

    # Compare submitted answer with true answer
    if comparison == 'relabs':
        rtol = pl.get_float_attrib(element, 'rtol', RTOL_DEFAULT)
        atol = pl.get_float_attrib(element, 'atol', ATOL_DEFAULT)
        correct = pl.is_correct_scalar_ra(a_sub, a_tru, rtol, atol)
    elif comparison == 'sigfig':
        digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
        correct = pl.is_correct_scalar_sf(a_sub, a_tru, digits)
    elif comparison == 'decdig':
        digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
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
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)

    # Get correct answer
    a_tru = data['correct_answers'][name]

    # If correct answer is in a format generated by pl.to_json, convert it
    # back to a standard type (otherwise, do nothing)
    a_tru = pl.from_json(a_tru)

    result = data['test_type']
    if result == 'correct':
        data['raw_submitted_answers'][name] = str(a_tru)
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    elif result == 'incorrect':
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
        # Get method of comparison, with relabs as default
        comparison = pl.get_string_attrib(element, 'comparison', COMPARISON_DEFAULT)
        if comparison == 'relabs':
            rtol = pl.get_float_attrib(element, 'rtol', RTOL_DEFAULT)
            atol = pl.get_float_attrib(element, 'atol', ATOL_DEFAULT)
            # Get max error according to numpy.allclose()
            eps = np.absolute(a_tru) * rtol + atol
            eps += random.uniform(1, 10)
            answer = a_tru + eps * random.choice([-1, 1])
        elif comparison == 'sigfig':
            digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
            # Get max error according to pl.is_correct_scalar_sf()
            if (a_tru == 0):
                n = digits - 1
            else:
                n = -int(np.floor(np.log10(np.abs(a_tru)))) + (digits - 1)
            eps = 0.51 * (10**-n)
            eps += random.uniform(1, 10)
            answer = a_tru + eps * random.choice([-1, 1])
        elif comparison == 'decdig':
            digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
            # Get max error according to pl.is_correct_scalar_dd()
            eps = 0.51 * (10**-digits)
            eps += random.uniform(1, 10)
            answer = a_tru + eps * random.choice([-1, 1])
        else:
            raise ValueError('method of comparison "%s" is not valid' % comparison)
        data['raw_submitted_answers'][name] = str(answer)
    elif result == 'invalid':
        # FIXME: add more invalid expressions, make text of format_errors
        # correct, and randomize
        data['raw_submitted_answers'][name] = '1 + 2'
        data['format_errors'][name] = 'invalid'
    else:
        raise Exception('invalid result: %s' % result)
