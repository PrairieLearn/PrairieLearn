import math
from html import escape

import chevron
import lxml.html
import prairielearn as pl

from pint import UnitRegistry, errors
from typing_extensions import assert_never

WEIGHT_DEFAULT = 1
CORRECT_ANSWER_DEFAULT = None
LABEL_DEFAULT = None
SUFFIX_DEFAULT = None
DISPLAY_DEFAULT = 'inline'
ALLOW_BLANK_DEFAULT = False
UNITS_ONLY_DEFAULT = False
BLANK_VALUE_DEFAULT = ''
COMPARISON_DEFAULT = 'relabs'
RTOL_DEFAULT = 1e-2
ATOL_DEFAULT = 1e-8
DIGITS_DEFAULT = 2
SIZE_DEFAULT = 35
SHOW_HELP_TEXT_DEFAULT = True
SHOW_PLACEHOLDER_DEFAULT = True
PLACEHOLDER_TEXT_THRESHOLD = 4  # Minimum size to show the placeholder text


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers-name']
    optional_attribs = [
        'weight', 'correct-answer', 'label', 'suffix', 'display',
        'allow-blank',
        'blank-value', 'units-only',
        'comparison', 'rtol', 'atol', 'digits',
        'size', 'show-help-text', 'show-placeholder'
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)

    name = pl.get_string_attrib(element, 'answers-name')
    correct_answer = pl.get_string_attrib(element, 'correct-answer', CORRECT_ANSWER_DEFAULT)

    if correct_answer is not None:
        if name in data['correct_answers']:
            raise ValueError("Duplicate correct_answers variable name: {name}")
        data['correct_answers'][name] = correct_answer


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    label = pl.get_string_attrib(element, 'label', LABEL_DEFAULT)
    suffix = pl.get_string_attrib(element, 'suffix', SUFFIX_DEFAULT)
    display = pl.get_string_attrib(element, 'display', DISPLAY_DEFAULT)
    size = pl.get_integer_attrib(element, 'size', SIZE_DEFAULT)
    comparison = pl.get_string_attrib(element, 'comparison', COMPARISON_DEFAULT)
    show_placeholder = pl.get_boolean_attrib(element, 'show-placeholder', SHOW_PLACEHOLDER_DEFAULT)
    units_only = pl.get_boolean_attrib(element, 'units-only', UNITS_ONLY_DEFAULT)

    if data['panel'] == 'question':
        editable = data['editable']
        raw_submitted_answer = data['raw_submitted_answers'].get(name, None)

        # Get info strings
        with open('pl-units-input.mustache', 'r', encoding='utf-8') as f:
            info = chevron.render(f, {'format': True, 'units_only': units_only}).strip()

        if units_only:
            placeholder_text = "Unit"
        elif comparison == 'exact':
            placeholder_text = 'Number (exact) + Unit'
        elif comparison == 'sigfig':
            #TODO fix number name mistake
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
            'show_placeholder': show_placeholder and size >= PLACEHOLDER_TEXT_THRESHOLD,
            'shortinfo': placeholder_text,
            'uuid': pl.get_uuid()
        }

        score = data['partial_scores'].get(name, {}).get('score', None)
        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        # if score is not None:
        #     try:
        #         score = float(score)
        #         if score >= 1:
        #             html_params['correct'] = True
        #         elif score > 0:
        #             html_params['partial'] = math.floor(score * 100)
        #         else:
        #             html_params['incorrect'] = True
        #     except ValueError:
        #         raise ValueError('invalid score' + score)

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
            return chevron.render(f, html_params).strip()

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
                raise ValueError('submitted answer is None')

            html_params['suffix'] = suffix
            html_params['a_sub'] = a_sub

        elif name not in data['submitted_answers']:
            html_params['missing_input'] = True
            html_params['parse_error'] = None

        else:
            raw_submitted_answer = data['raw_submitted_answers'].get(name, None)
            if raw_submitted_answer is not None:
                html_params['raw_submitted_answer'] = pl.escape_unicode_string(raw_submitted_answer)

        score = data['partial_scores'].get(name, {}).get('score', None)
        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        # if score is not None:
        #     try:
        #         score = float(score)
        #         if score >= 1:
        #             html_params['correct'] = True
        #         elif score > 0:
        #             html_params['partial'] = math.floor(score * 100)
        #         else:
        #             html_params['incorrect'] = True
        #     except ValueError:
        #         raise ValueError('invalid score' + score)

        html_params['error'] = html_params['parse_error'] or html_params.get('missing_input', False)
        with open('pl-units-input.mustache', 'r', encoding='utf-8') as f:
            return chevron.render(f, html_params).strip()

    #TODO make this display consistent with number input
    elif data['panel'] == 'answer':
        a_tru = data['correct_answers'].get(name, None)

        if a_tru is None:
            return ""

        html_params = {
            'answer': True,
            'label': label,
            'a_tru': a_tru,
            'suffix': suffix
        }
        with open('pl-units-input.mustache', 'r', encoding='utf-8') as f:
            return chevron.render(f, html_params).strip()

    assert_never(data['panel'])


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    allow_blank = pl.get_string_attrib(element, 'allow-blank', ALLOW_BLANK_DEFAULT)
    units_only = pl.get_boolean_attrib(element, 'units-only', UNITS_ONLY_DEFAULT)
    blank_value = pl.get_string_attrib(element, 'blank-value', BLANK_VALUE_DEFAULT)

    # retrieves submitted answer
    a_sub = data['submitted_answers'].get(name, None)
    if a_sub is None:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = None
        return

    # checks for blank answer
    if not a_sub:
        if allow_blank:
            data['submitted_answers'][name] = blank_value
        else:
            data['format_errors'][name] = 'Invalid format. The submitted answer was left blank.'
            data['submitted_answers'][name] = None

        return

    # Store cache in path local to question. Needed to prevent slow grading / parsing times
    # due to object creation. TODO double check that doing this is ok
    ureg = UnitRegistry(cache_folder=data['options']['question_path'])

    # checks for invalids by parsing as a dimensionful quantity
    # TODO check for more possible exceptions here?
    try:
        parsed_answer = ureg.Quantity(a_sub)
    except errors.UndefinedUnitError:  # incorrect units
        data['format_errors'][name] = 'Invalid unit.'
        return

    # checks for no unit in submitted answer
    if parsed_answer.dimensionless:
        data['format_errors'][name] = 'Invalid format. The submitted answer has no unit.'
        data['submitted_answers'][name] = None
        return

    # checks for no number in submitted answer
    # TODO maybe make a helper function that checks for this? I don't think this is being done right
    numberless = '1' not in a_sub and parsed_answer.magnitude == 1

    if numberless and not units_only:
        data['format_errors'][name] = 'Invalid format. The submitted answer should be a unit only.'
        data['submitted_answers'][name] = None
        return


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)
    comparison = pl.get_string_attrib(element, 'comparison', COMPARISON_DEFAULT)

    a_tru = data['correct_answers'].get(name, None)
    if a_tru is None:
        return

    # Store cache in path local to question. Needed to prevent slow grading / parsing times
    # due to object creation
    ureg = UnitRegistry(cache_folder=data['options']['question_path'])
    a_tru_parsed = ureg.Quantity(a_tru)  # implicit assumption that true answer is formatted correctly


    a_sub = data['submitted_answers'].get(name, None)
    if a_sub is None:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
        return

    a_sub_parsed = ureg.Quantity(a_sub)  # will return no error, assuming parse() catches all of them

    # TODO rewrite this with grade question parameterized framework

    if comparison == 'exact':
        if a_tru_parsed == a_sub_parsed:
            data['partial_scores'][name] = {'score': 1, 'weight': weight}
        elif a_tru_parsed.units == a_sub_parsed.units:  # if units are in the same dimension, allow half marks
            data['partial_scores'][name] = {'score': 0.5, 'weight': weight}
        else:
            data['partial_scores'][name] = {'score': 0, 'weight': weight}
    elif comparison == 'sigfig':
        digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
        units_equal = a_tru_parsed.units == a_sub_parsed.units

        if pl.is_correct_scalar_sf(a_tru_parsed.magnitude, a_sub_parsed.magnitude, digits) and units_equal:
            data['partial_scores'][name] = {'score': 1, 'weight': weight}
        elif units_equal:  # if units are in the same dimension, allow half marks
            data['partial_scores'][name] = {'score': 0.5, 'weight': weight}
        else:
            data['partial_scores'][name] = {'score': 0, 'weight': weight}
    elif comparison == 'relabs':
        rtol = pl.get_float_attrib(element, 'rtol', RTOL_DEFAULT)
        atol = pl.get_float_attrib(element, 'atol', ATOL_DEFAULT)
        units_equal = a_tru_parsed.units == a_sub_parsed.units

        if pl.is_correct_scalar_ra(a_tru_parsed.magnitude, a_sub_parsed.magnitude, rtol, atol) and units_equal:
            data['partial_scores'][name] = {'score': 1, 'weight': weight}
        elif units_equal:  # if units are in the same dimension, allow half marks
            data['partial_scores'][name] = {'score': 0.5, 'weight': weight}
        else:
            data['partial_scores'][name] = {'score': 0, 'weight': weight}
    else:
        raise ValueError('method of comparison "%s" us not valid' % comparison)


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)

    a_tru = data['correct_answers'][name]

    result = data['test_type']
    if result == 'correct':
        data['raw_submitted_answers'][name] = str(a_tru)
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    elif result == 'incorrect':
        # TODO add test case where unit is switched, and test case where number is
        data['partial_scores'][name] = {'score': 0.5, 'weight': weight}
        answer = UnitRegistry(cache_folder=data['options']['question_path']).Quantity(a_tru) * 2
        data['raw_submitted_answers'][name] = str(answer)
    elif result == 'invalid':
        data['raw_submitted_answers'][name] = '1 vfg'
        data['format_errors'][name] = 'Invalid unit.'
    else:
        assert_never(result)
