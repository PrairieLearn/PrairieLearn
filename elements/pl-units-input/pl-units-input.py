import math
from html import escape

import chevron
import lxml.html
import prairielearn as pl

from enum import Enum
from pint import UnitRegistry, errors, Quantity
from typing import Tuple, Optional
from typing_extensions import assert_never

class DisplayType(Enum):
    INLINE = "inline"
    BLOCK = "block"

class ComparisonType(Enum):
    RELABS = "relabs"
    SIGFIG = "sigfig"
    EXACT = "exact"
    DECDIG = "decdig"

class GradingMode(Enum):
    UNITS_ONLY = 1
    UNITS_FIXED = 2
    UNITS_AGNOSTIC = 2

GRADING_MODE_DEFAULT = GradingMode.UNITS_FIXED
WEIGHT_DEFAULT = 1
CORRECT_ANSWER_DEFAULT = None
LABEL_DEFAULT = None
SUFFIX_DEFAULT = None
DISPLAY_DEFAULT = DisplayType.INLINE
ALLOW_BLANK_DEFAULT = False
UNITS_ONLY_DEFAULT = False
BLANK_VALUE_DEFAULT = ''
COMPARISON_DEFAULT = ComparisonType.RELABS
RTOL_DEFAULT = 1e-2
ATOL_DEFAULT = '1e-8'
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
        'blank-value', 'grading-mode',
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

    digits = pl.get_integer_attrib(element, 'digits', None)
    if digits is not None and digits <= 0:
        raise ValueError(f"Number of digits specified must be at least 1, not {digits}.")

    atol = pl.get_string_attrib(element, 'atol', ATOL_DEFAULT)
    grading_mode = pl.get_enum_attrib(GradingMode, element, 'grading-mode', GRADING_MODE_DEFAULT)

    ureg = UnitRegistry(cache_folder=":auto:")
    parsed_atol = ureg.Quantity(atol)

    # In units agnostic mode, absolute tolerance must have units. Otherwise just a float
    if grading_mode is GradingMode.UNITS_AGNOSTIC:
        if parsed_atol.dimensionless:
            raise ValueError(f"atol parameter '{atol}' must have units in unit agnostic grading.")
        if pl.has_attrib(element, 'comparison'):
            raise ValueError(f"Cannot change comparison type in unit agnostic grading.")
    else:
        if not parsed_atol.dimensionless:
            raise ValueError(f"atol parameter {atol} may only have units in units agnostic grading.")

def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    label = pl.get_string_attrib(element, 'label', LABEL_DEFAULT)
    suffix = pl.get_string_attrib(element, 'suffix', SUFFIX_DEFAULT)
    display = pl.get_enum_attrib(DisplayType, element, 'display', DISPLAY_DEFAULT)
    size = pl.get_integer_attrib(element, 'size', SIZE_DEFAULT)
    comparison = pl.get_enum_attrib(ComparisonType, element, 'comparison', COMPARISON_DEFAULT)
    show_placeholder = pl.get_boolean_attrib(element, 'show-placeholder', SHOW_PLACEHOLDER_DEFAULT)
    grading_mode = pl.get_enum_attrib(GradingMode, element, 'grading-mode', GRADING_MODE_DEFAULT)

    partial_scores = data['partial_scores'].get(name, {})
    score = partial_scores.get('score')

    if data['panel'] == 'question':
        editable = data['editable']
        raw_submitted_answer = data['raw_submitted_answers'].get(name, None)

        # Get info strings
        with open('pl-units-input.mustache', 'r', encoding='utf-8') as f:
            info = chevron.render(f, {'format': True, 'units_only': grading_mode is GradingMode.UNITS_ONLY}).strip()

        if grading_mode is GradingMode.UNITS_ONLY:
            placeholder_text = "Unit"
        elif grading_mode is GradingMode.UNITS_AGNOSTIC or comparison is ComparisonType.RELABS:
            rtol = pl.get_float_attrib(element, 'rtol', RTOL_DEFAULT)
            atol = pl.get_string_attrib(element, 'atol', ATOL_DEFAULT)
            placeholder_text = f'Number (rtol={rtol}, atol={atol}) + Unit'
        elif comparison is ComparisonType.EXACT:
            placeholder_text = 'Number (exact) + Unit'
        elif comparison is ComparisonType.SIGFIG:
            digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
            figure_str = 'figure' if digits == 1 else 'figures'
            placeholder_text = f'Number ({digits} significant {figure_str}) + Unit'
        elif comparison is ComparisonType.DECDIG:
            digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
            digit_str = 'digit' if digits == 1 else 'digits'
            placeholder_text = f'Number ({digits} {digit_str} after decimal) + Unit'
        else:
            assert_never(comparison)

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

        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        html_params['display_append_span'] = html_params['show_info'] or suffix

        if display is DisplayType.INLINE:
            html_params['inline'] = True
        elif display is DisplayType.BLOCK:
            html_params['block'] = True
        else:
            assert_never(display)

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

        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        feedback = partial_scores.get('feedback')
        if feedback is not None:
            html_params['feedback'] = feedback

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

    # TODO double check that doing this is ok. May need to switch to directory local to question / server
    ureg = UnitRegistry(cache_folder=":auto:")

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
    comparison = pl.get_enum_attrib(ComparisonType, element, 'comparison', COMPARISON_DEFAULT)
    digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
    rtol = pl.get_float_attrib(element, 'rtol', RTOL_DEFAULT)
    atol = pl.get_string_attrib(element, 'atol', ATOL_DEFAULT)
    grading_mode = pl.get_enum_attrib(GradingMode, element, 'grading-mode', GRADING_MODE_DEFAULT)

    a_tru = data['correct_answers'].get(name, None)
    if a_tru is None:
        return

    # Store cache on system. Needed to prevent slow grading / parsing times
    # due to object creation
    ureg = UnitRegistry(cache_folder=":auto:")
    parsed_correct_ans = ureg.Quantity(a_tru)  # implicit assumption that true answer is formatted correctly
    parsed_atol = ureg.Quantity(atol)

    def magnitude_comparison(correct_ans: Quantity, submitted_ans: Quantity) -> bool:
        """Returns true if student_ans is close enough to correct answer in magnitude based on comparison algorithm"""
        if comparison is ComparisonType.EXACT:
            return correct_ans.magnitude == submitted_ans.magnitude
        elif comparison is ComparisonType.SIGFIG:
            return pl.is_correct_scalar_sf(submitted_ans.magnitude, correct_ans.magnitude, digits)
        elif comparison is ComparisonType.DECDIG:
            return pl.is_correct_scalar_dd(submitted_ans.magnitude, correct_ans.magnitude, digits)
        elif comparison is ComparisonType.RELABS:
            return pl.is_correct_scalar_ra(submitted_ans.magnitude, correct_ans.magnitude, rtol, parsed_atol.magnitude)

        assert_never(comparison)


    pl.grade_question_parameterized(data, name, grade_unit_input, weight)


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
        answer = UnitRegistry(cache_folder=":auto:").Quantity(a_tru) * 2
        data['raw_submitted_answers'][name] = str(answer)
    elif result == 'invalid':
        data['raw_submitted_answers'][name] = '1 vfg'
        data['format_errors'][name] = 'Invalid unit.'
    else:
        assert_never(result)
