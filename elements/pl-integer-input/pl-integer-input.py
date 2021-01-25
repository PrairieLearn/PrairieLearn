import lxml.html
from html import escape
import chevron
import math
import prairielearn as pl
import random
import numpy


WEIGHT_DEFAULT = 1
CORRECT_ANSWER_DEFAULT = None
LABEL_DEFAULT = None
SUFFIX_DEFAULT = None
DISPLAY_DEFAULT = 'inline'
SIZE_DEFAULT = 35
SHOW_HELP_TEXT_DEFAULT = True
PLACEHOLDER_TEXT_THRESHOLD = 4  # Minimum size to show the placeholder text
ALLOW_BLANK_DEFAULT = False
BLANK_VALUE_DEFAULT = 0
BASE_DEFAULT = 10


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers-name']
    optional_attribs = ['weight', 'correct-answer', 'label', 'suffix', 'display', 'size', 'show-help-text', 'base', 'allow-blank', 'blank-value']

    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, 'answers-name')
    base = pl.get_integer_attrib(element, 'base', BASE_DEFAULT)

    if base != 0 and (base < 2 or base > 36):
        raise Exception('Base must be either 0, or between 2 and 36')

    correct_answer = pl.get_string_attrib(element, 'correct-answer', CORRECT_ANSWER_DEFAULT)
    if correct_answer is not None:
        if name in data['correct_answers']:
            raise Exception('duplicate correct_answers variable name: %s' % name)
        # Test conversion, but leave as string so proper value is shown on answer panel
        if pl.string_to_integer(correct_answer, base) is None:
            raise Exception('correct answer is not a valid input: %s' % name)
        data['correct_answers'][name] = correct_answer


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    label = pl.get_string_attrib(element, 'label', LABEL_DEFAULT)
    suffix = pl.get_string_attrib(element, 'suffix', SUFFIX_DEFAULT)
    display = pl.get_string_attrib(element, 'display', DISPLAY_DEFAULT)
    size = pl.get_integer_attrib(element, 'size', SIZE_DEFAULT)
    base = pl.get_integer_attrib(element, 'base', BASE_DEFAULT)

    if data['panel'] == 'question':
        editable = data['editable']
        raw_submitted_answer = data['raw_submitted_answers'].get(name, None)

        # Get info strings
        info_params = {
            'format': True,
            'base': base,
            'default_base': base == BASE_DEFAULT or base == 0,
            'zero_base': base == 0
        }
        with open('pl-integer-input.mustache', 'r', encoding='utf-8') as f:
            info = chevron.render(f, info_params).strip()
        with open('pl-integer-input.mustache', 'r', encoding='utf-8') as f:
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
            'size': size,
            'base': base,
            'show_info': pl.get_boolean_attrib(element, 'show-help-text', SHOW_HELP_TEXT_DEFAULT),
            'show_placeholder': size >= PLACEHOLDER_TEXT_THRESHOLD,
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
        with open('pl-integer-input.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'submission':
        parse_error = data['format_errors'].get(name, None)
        html_params = {
            'submission': True,
            'label': label,
            'base': base,
            'default_base': base == BASE_DEFAULT or base == 0,
            'parse_error': parse_error,
            'uuid': pl.get_uuid()
        }

        if parse_error is None and name in data['submitted_answers']:
            # Get submitted answer, raising an exception if it does not exist
            a_sub = data['submitted_answers'].get(name, None)
            if a_sub is None:
                raise Exception('submitted answer is None')

            # If answer is in a format generated by pl.to_json, convert it
            # back to a standard type (otherwise, do nothing)
            a_sub = pl.from_json(a_sub)

            html_params['suffix'] = suffix
            html_params['a_sub'] = numpy.base_repr(a_sub, base) if base > 0 else data['raw_submitted_answers'].get(name, str(a_sub))

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

        with open('pl-integer-input.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    elif data['panel'] == 'answer':
        a_tru = pl.from_json(data['correct_answers'].get(name, None))
        if a_tru is not None:
            if isinstance(a_tru, str):
                a_tru_str = a_tru
                a_tru = pl.string_to_integer(a_tru_str, base)
            else:
                a_tru_str = numpy.base_repr(a_tru, base if base > 0 else 10)
            html_params = {'answer': True, 'label': label, 'a_tru': a_tru_str, 'suffix': suffix}
            with open('pl-integer-input.mustache', 'r', encoding='utf-8') as f:
                html = chevron.render(f, html_params).strip()
        else:
            html = ''
    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    base = pl.get_integer_attrib(element, 'base', BASE_DEFAULT)

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data['submitted_answers'].get(name, None)
    if a_sub is None:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = None
        return

    if a_sub.strip() == '':

        if pl.get_boolean_attrib(element, 'allow-blank', ALLOW_BLANK_DEFAULT):
            a_sub = pl.get_integer_attrib(element, 'blank-value', BLANK_VALUE_DEFAULT)
        else:
            opts = {
                'format_error': True,
                'format_error_message': 'the submitted answer was blank.',
                'base': base,
                'default_base': base == BASE_DEFAULT or base == 0,
                'zero_base': base == 0
            }
            with open('pl-integer-input.mustache', 'r', encoding='utf-8') as f:
                format_str = chevron.render(f, opts).strip()
                data['format_errors'][name] = format_str
                data['submitted_answers'][name] = None
            return

    # Convert to integer
    try:
        a_sub_parsed = pl.string_to_integer(str(a_sub), base)
        if a_sub_parsed is None:
            raise ValueError('invalid submitted answer (wrong type)')
        data['submitted_answers'][name] = pl.to_json(a_sub_parsed)
    except Exception:
        with open('pl-integer-input.mustache', 'r', encoding='utf-8') as f:
            format_str = chevron.render(f, {
                'format_error': True,
                'base': base,
                'default_base': base == BASE_DEFAULT or base == 0,
                'zero_base': base == 0
            }).strip()
        data['format_errors'][name] = format_str
        data['submitted_answers'][name] = None


def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    base = pl.get_integer_attrib(element, 'base', BASE_DEFAULT)

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

    # Cast both submitted and true answers as integers.
    a_tru = pl.string_to_integer(a_tru, base) if isinstance(a_tru, str) else int(a_tru)
    a_sub = pl.string_to_integer(a_sub, base) if isinstance(a_sub, str) else int(a_sub)

    if a_tru == a_sub:
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    else:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}


def test(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)
    base = pl.get_integer_attrib(element, 'base', BASE_DEFAULT)

    # Get correct answer
    a_tru = data['correct_answers'][name]

    # If correct answer is in a format generated by pl.to_json, convert it
    # back to a standard type (otherwise, do nothing)
    a_tru = pl.from_json(a_tru)
    if isinstance(a_tru, str):
        a_tru = pl.string_to_integer(a_tru, base)

    result = data['test_type']
    if result == 'correct':
        if base > 0:
            data['raw_submitted_answers'][name] = numpy.base_repr(a_tru, base)
        elif random.choice([True, False]):
            data['raw_submitted_answers'][name] = numpy.base_repr(a_tru, 10)
        else:
            # Use 0x format
            data['raw_submitted_answers'][name] = f'{a_tru:#x}'
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    elif result == 'incorrect':
        data['raw_submitted_answers'][name] = numpy.base_repr(a_tru + (random.randint(1, 11) * random.choice([-1, 1])), base if base > 0 else 10)
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
    elif result == 'invalid':
        # FIXME: add more invalid expressions, make text of format_errors
        # correct, and randomize
        if random.choice([True, False]):
            data['raw_submitted_answers'][name] = '1 + 2'
        else:
            data['raw_submitted_answers'][name] = '3.4'
        data['format_errors'][name] = 'invalid'
    else:
        raise Exception('invalid result: %s' % result)
