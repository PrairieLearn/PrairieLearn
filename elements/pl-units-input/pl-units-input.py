import math
from html import escape

import chevron
import lxml.html
import prairielearn as pl

import units


WEIGHT_DEFAULT = 1
CORRECT_ANSWER_DEFAULT = None
LABEL_DEFAULT = None
SUFFIX_DEFAULT = None
DISPLAY_DEFAULT = 'inline'
ALLOW_BLANK_DEFAULT = False
ALLOW_UNITLESS_DEFAULT = False
ALLOW_NUMBERLESS_DEFAULT = False
BLANK_VALUE_DEFAULT = ''
UNITLESS_VALUE_DEFAULT = 'rad'
NUMBERLESS_VALUE_DEFAULT = 0
COMPARISON_DEFAULT = 'sigfig'
RTOL_DEFAULT = 1e-2
ATOL_DEFAULT = 1e-8
DIGITS_DEFAULT = 2
SIZE_DEFAULT = 35
SHOW_HELP_TEXT_DEFAULT = True
PLACEHOLDER_TEXT_THRESHOLD = 4  # Minimum size to show the placeholder text


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers-name']
    optional_attribs = [
        'weight', 'correct-answer', 'label', 'suffix', 'display',
        'allow-blank', 'allow-unitless', 'allow-numberless',
        'blank-value', 'unitless-value', 'numberless-value',
        'comparison', 'rtol', 'atol', 'digits',
        'size', 'show-help-text'
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)

    name = pl.get_string_attrib(element, 'answers-name')
    correct_answer = pl.get_string_attrib(element, 'correct-answer', CORRECT_ANSWER_DEFAULT)

    if correct_answer is not None:
        if name in data['correct_answers']:
            raise Exception('duplicate correct_answers variable name: %s' % name)
        data['correct_answers'][name] = correct_answer


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    label = pl.get_string_attrib(element, 'label', LABEL_DEFAULT)
    suffix = pl.get_string_attrib(element, 'suffix', SUFFIX_DEFAULT)
    display = pl.get_string_attrib(element, 'display', DISPLAY_DEFAULT)
    size = pl.get_integer_attrib(element, 'size', SIZE_DEFAULT)
    comparison = pl.get_string_attrib(element, 'comparison', COMPARISON_DEFAULT)

    if data['panel'] == 'question':
        editable = data['editable']
        raw_submitted_answer = data['raw_submitted_answers'].get(name, None)

        # Get info strings
        info_params = {'format': True}
        with open('pl-units-input.mustache', 'r', encoding='utf-8') as f:
            template = f.read()
            info = chevron.render(template, info_params).strip()
            info_params.pop('format', None)

        if comparison == 'exact':
            placeholder_text = 'Number (exact) + Unit'
        elif comparison == 'sigfig':
            digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
            placeholder_text = f'Number ({digits} significant figures) + Unit'
        elif comparison == 'relabs':
            rtol = pl.get_float_attrib(element, 'rtol', RTOL_DEFAULT)
            atol = pl.get_float_attrib(element, 'atol', ATOL_DEFAULT)
            placeholder_text = f'Number (rtol={rtol}, atol={atol}) + Unit'
        else:
            placeholder_text = 'Number + Unit'

        html_params = {
            'question': True,
            'name': name,
            'label': label,
            'suffix': suffix,
            'editable': editable,
            'info': info,
            'size': size,
            'show_info': pl.get_boolean_attrib(element, 'show-help-text', SHOW_HELP_TEXT_DEFAULT),
            'show_placeholder': size >= PLACEHOLDER_TEXT_THRESHOLD,
            'shortinfo': placeholder_text,
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

        html_params['display_append_span'] = html_params['show_info'] or suffix

        if display == 'inline':
            html_params['inline'] = True
        elif display == 'block':
            html_params['block'] = True
        else:
            raise ValueError('method of display "%s" is not valid (must be "inline" or "block")' % display)

        if raw_submitted_answer is not None:
            html_params['raw_submitted_answer'] = escape(raw_submitted_answer)
        with open('pl-units-input.mustache', 'r', encoding='utf-8') as f:
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
            # Get submitted answer, raising an exception if it does not exist
            a_sub = data['submitted_answers'].get(name, None)
            if a_sub is None:
                raise Exception('submitted answer is None')

            html_params['suffix'] = suffix
            html_params['a_sub'] = a_sub

        elif name not in data['submitted_answers']:
            html_params['missing_input'] = True
            html_params['parse_error'] = None

        else:
            raw_submitted_answer = data['raw_submitted_answers'].get(name, None)
            if raw_submitted_answer is not None:
                html_params['raw_submitted_answer'] = pl.escape_unicode_string(raw_submitted_answer)

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
        with open('pl-units-input.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'answer':
        a_tru = pl.from_json(data['correct_answers'].get(name, None))
        if a_tru is not None:
            html_params = {
                'answer': True,
                'label': label,
                'first_tru': a_tru[0],
                'last_tru': a_tru[1],
                'suffix': suffix
            }
            with open('pl-units-input.mustache', 'r', encoding='utf-8') as f:
                html = chevron.render(f, html_params).strip()
        else:
            html = ''

    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    allow_blank = pl.get_string_attrib(element, 'allow-blank', ALLOW_BLANK_DEFAULT)
    allow_unitless = pl.get_string_attrib(element, 'allow-unitless', ALLOW_UNITLESS_DEFAULT)
    allow_numberless = pl.get_string_attrib(element, 'allow-numberless', ALLOW_NUMBERLESS_DEFAULT)
    blank_value = pl.get_string_attrib(element, 'blank-value', str(BLANK_VALUE_DEFAULT))
    unitless_value = pl.get_string_attrib(element, 'unitless-value', str(UNITLESS_VALUE_DEFAULT))
    numberless_value = pl.get_string_attrib(element, 'numberless-value', str(NUMBERLESS_VALUE_DEFAULT))

    # retrieves submitted answer
    a_sub = data['submitted_answers'].get(name, None)
    if a_sub is None:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = None
        return

    # checks for blank answer
    if not a_sub and not allow_blank:
        data['format_errors'][name] = 'Invalid format. The submitted answer was left blank.'
        data['submitted_answers'][name] = None
    elif not a_sub and allow_blank:
        data['submitted_answers'][name] = blank_value

    # checks for no unit in submitted answer
    unitless = units.DimensionfulQuantity.check_unitless(a_sub)
    if unitless and not allow_unitless:
        data['format_errors'][name] = 'Invalid format. The submitted answer has no unit.'
        data['submitted_answers'][name] = None
    elif unitless and allow_unitless:
        data['submitted_answers'][name] = a_sub + unitless_value

    # checks for no number in submitted answer
    numberless = units.DimensionfulQuantity.check_numberless(a_sub)
    if numberless and not allow_numberless:
        data['format_errors'][name] = 'Invalid format. The submitted answer has no number.'
        data['submitted_answers'][name] = None
    elif numberless and allow_numberless:
        data['submitted_answers'][name] = numberless_value + a_sub

    # checks for invalids by parsing as a dimensionful quantity
    try:
        units.DimensionfulQuantity.from_string(a_sub)
    except units.units.InvalidUnit:  # incorrect units
        data['format_errors'][name] = 'Invalid unit.'
    except units.units.DisallowedExpression:  # incorrect usage of prefixes + imperial
        data['format_errors'][name] = 'Invalid unit.'
    except ValueError:  # can't convert to float
        data['format_errors'][name] = 'Invalid number.'


def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)
    comparison = pl.get_string_attrib(element, 'comparison', COMPARISON_DEFAULT)

    a_tru = data['correct_answers'].get(name, None)
    if a_tru is None:
        return
    a_tru = units.DimensionfulQuantity.from_string(a_tru)  # implicit assumption that true answer is formatted correctly

    a_sub = data['submitted_answers'].get(name, None)
    if a_sub is None:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
        return
    a_sub = units.DimensionfulQuantity.from_string(a_sub)  # will return no error, assuming parse() catches all of them

    if comparison == 'exact':
        if a_tru == a_sub:
            data['partial_scores'][name] = {'score': 1, 'weight': weight}
        elif a_tru.unit == a_sub.unit:  # if units are in the same dimension, allow half marks
            data['partial_scores'][name] = {'score': 0.5, 'weight': weight}
        else:
            data['partial_scores'][name] = {'score': 0, 'weight': weight}
    elif comparison == 'sigfig':
        digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
        if a_tru.sigfig_equals(a_sub, digits):
            data['partial_scores'][name] = {'score': 1, 'weight': weight}
        elif a_tru.unit == a_sub.unit:  # if units are in the same dimension, allow half marks
            data['partial_scores'][name] = {'score': 0.5, 'weight': weight}
        else:
            data['partial_scores'][name] = {'score': 0, 'weight': weight}
    elif comparison == 'relabs':
        rtol = pl.get_float_attrib(element, 'rtol', RTOL_DEFAULT)
        atol = pl.get_float_attrib(element, 'atol', ATOL_DEFAULT)
        if a_tru.relabs_equals(a_sub, rtol, atol):
            data['partial_scores'][name] = {'score': 1, 'weight': weight}
        elif a_tru.unit == a_sub.unit:  # if units are in the same dimension, allow half marks
            data['partial_scores'][name] = {'score': 0.5, 'weight': weight}
        else:
            data['partial_scores'][name] = {'score': 0, 'weight': weight}
    else:
        raise ValueError('method of comparison "%s" us not valid' % comparison)


def test(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)

    a_tru = data['correct_answers'][name]

    result = data['test_type']
    if result == 'correct':
        data['raw_submitted_answers'][name] = str(a_tru)
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    elif result == 'incorrect':
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
        i = units.DimensionfulQuantity.get_index(a_tru)
        u = 's' if a_tru[i:].strip() == 'm' else 'm'
        answer = a_tru[:i] + u
        data['raw_submitted_answers'][name] = str(answer)
    elif result == 'invalid':
        data['raw_submitted_answers'][name] = '1 vfg'
        data['format_errors'][name] = 'Invalid unit.'
