import lxml.html
from html import escape
import chevron
import math
import prairielearn as pl
import random


WEIGHT_DEFAULT = 1
CORRECT_ANSWER_DEFAULT = None
LABEL_DEFAULT = None
SUFFIX_DEFAULT = None
DISPLAY_DEFAULT = 'inline'
REMOVE_LEADING_TRAILING_DEFAULT = False
REMOVE_SPACES_DEFAULT = False
PLACEHOLDER_DEFAULT = None
ALLOW_BLANK_DEFAULT = False
IGNORE_CASE_DEFAULT = False
SIZE_DEFAULT = 35
SHOW_HELP_TEXT_DEFAULT = True


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers-name']
    optional_attribs = ['weight', 'correct-answer', 'label', 'suffix', 'display', 'remove-leading-trailing', 'remove-spaces', 'allow-blank', 'ignore-case', 'placeholder', 'size', 'show-help-text']
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
    remove_leading_trailing = pl.get_string_attrib(element, 'remove-leading-trailing', REMOVE_LEADING_TRAILING_DEFAULT)
    remove_spaces = pl.get_string_attrib(element, 'remove-spaces', REMOVE_SPACES_DEFAULT)
    placeholder = pl.get_string_attrib(element, 'placeholder', PLACEHOLDER_DEFAULT)

    if data['panel'] == 'question':
        editable = data['editable']
        raw_submitted_answer = data['raw_submitted_answers'].get(name, None)

        if remove_leading_trailing:
            if remove_spaces:
                space_hint = 'All spaces will be removed from your answer.'
            else:
                space_hint = 'Leading and trailing spaces will be removed from your answer.'
        else:
            if remove_spaces:
                space_hint = 'All spaces between text will be removed but leading and trailing spaces will be left as part of your answer.'
            else:
                space_hint = 'Leading and trailing spaces will be left as part of your answer.'

        # Get info strings
        info_params = {'format': True, 'space_hint': space_hint}
        with open('pl-string-input.mustache', 'r', encoding='utf-8') as f:
            template = f.read()
            info = chevron.render(template, info_params).strip()
            info_params.pop('format', None)

        html_params = {
            'question': True,
            'name': name,
            'label': label,
            'suffix': suffix,
            'remove-leading-trailing': remove_leading_trailing,
            'remove-spaces': remove_spaces,
            'editable': editable,
            'info': info,
            'placeholder': placeholder,
            'size': pl.get_integer_attrib(element, 'size', SIZE_DEFAULT),
            'show_info': pl.get_boolean_attrib(element, 'show-help-text', SHOW_HELP_TEXT_DEFAULT),
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
        with open('pl-string-input.mustache', 'r', encoding='utf-8') as f:
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

            # If answer is in a format generated by pl.to_json, convert it
            # back to a standard type (otherwise, do nothing)
            a_sub = pl.from_json(a_sub)
            a_sub = pl.escape_unicode_string(a_sub)

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

        with open('pl-string-input.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    elif data['panel'] == 'answer':
        a_tru = pl.from_json(data['correct_answers'].get(name, None))
        if a_tru is not None:
            html_params = {'answer': True, 'label': label, 'a_tru': a_tru, 'suffix': suffix}
            with open('pl-string-input.mustache', 'r', encoding='utf-8') as f:
                html = chevron.render(f, html_params).strip()
        else:
            html = ''
    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    # Get allow-blank option
    allow_blank = pl.get_string_attrib(element, 'allow-blank', ALLOW_BLANK_DEFAULT)

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data['submitted_answers'].get(name, None)
    if a_sub is None:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = None
        return

    if not a_sub and not allow_blank:
        data['format_errors'][name] = 'Invalid format. The submitted answer was left blank.'
        data['submitted_answers'][name] = None
    else:
        data['submitted_answers'][name] = pl.to_json(a_sub)


def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')

    # Get weight
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)

    # Get remove-spaces option
    remove_spaces = pl.get_string_attrib(element, 'remove-spaces', REMOVE_SPACES_DEFAULT)

    # Get remove-leading-trailing option
    remove_leading_trailing = pl.get_string_attrib(element, 'remove-leading-trailing', REMOVE_LEADING_TRAILING_DEFAULT)

    # Get string case sensitivity option
    ignore_case = pl.get_string_attrib(element, 'ignore-case', IGNORE_CASE_DEFAULT)

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

    # Remove the leading and trailing characters
    if (remove_leading_trailing):
        a_sub = a_sub.strip()
        a_tru = a_tru.strip()

    # Remove the blank spaces between characters
    if (remove_spaces):
        a_sub = a_sub.replace(' ', '')
        a_tru = a_tru.replace(' ', '')

    # Modify string case for submission and true answer to be lower.
    if (ignore_case):
        a_sub = a_sub.lower()
        a_tru = a_tru.lower()

    if a_tru == a_sub:
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    else:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}


def test(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)
    allow_blank = pl.get_string_attrib(element, 'allow-blank', ALLOW_BLANK_DEFAULT)

    # Get correct answer
    a_tru = data['correct_answers'][name]

    # If correct answer is in a format generated by pl.to_json, convert it
    # back to a standard type (otherwise, do nothing)
    a_tru = pl.from_json(a_tru)

    if allow_blank:
        # no invalid answer implemented when allow-blank="true"
        result = random.choices(['correct', 'incorrect'], [5, 5])[0]
    else:
        result = random.choices(['correct', 'incorrect', 'invalid'], [5, 5, 1])[0]

    if result == 'correct':
        data['raw_submitted_answers'][name] = a_tru
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    elif result == 'incorrect':
        data['raw_submitted_answers'][name] = a_tru + str((random.randint(1, 11) * random.choice([-1, 1])))
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
    elif result == 'invalid':
        data['raw_submitted_answers'][name] = ''
        data['format_errors'][name] = 'invalid'
    else:
        raise Exception('invalid result: %s' % result)
