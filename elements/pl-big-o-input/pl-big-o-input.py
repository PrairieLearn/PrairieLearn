from enum import Enum
from typing import Callable, List, Optional, Tuple, Literal
from typing_extensions import assert_never
import prairielearn as pl
import lxml.html
from html import escape
import sympy
import chevron
import python_helper_sympy as phs
import big_o_utils as bou
import random

VARIABLES_DEFAULT = ''
DISPLAY_DEFAULT = 'inline'
SIZE_DEFAULT = 35
PLACEHOLDER_TEXT_THRESHOLD = 20
SHOW_HELP_TEXT_DEFAULT = True
WEIGHT_DEFAULT = 1


class BigOType(Enum):
    BIG_O = r'O'
    THETA = r'\Theta'
    OMEGA = r'\Omega'
    LITTLE_O = r'o'
    LITTLE_OMEGA = r'\omega'


class DisplayType(Enum):
    INLINE = 'inline'
    BLOCK = 'block'


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers-name']
    optional_attribs = ['weight', 'correct-answer', 'variables', 'size', 'display', 'show-help-text', 'type']
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, 'answers-name')

    if pl.has_attrib(element, 'correct-answer'):
        if name in data['correct_answers']:
            raise ValueError(f'duplicate correct_answers variable name: {name}')
        data['correct_answers'][name] = pl.get_string_attrib(element, 'correct-answer')


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    variables = get_variables_list(pl.get_string_attrib(element, 'variables', VARIABLES_DEFAULT))
    if len(variables) > 1:
        raise ValueError('Only one variable is supported')
    display = DisplayType(pl.get_string_attrib(element, 'display', DISPLAY_DEFAULT))
    size = pl.get_integer_attrib(element, 'size', SIZE_DEFAULT)

    bigo_type = BigOType[pl.get_string_attrib(element, 'type', BigOType.BIG_O.name).upper()].value

    operators: List[str] = ['exp', 'log', 'sqrt', 'factorial', '( )', '+', '-', '*', '/', '^', '**']
    constants: List[str] = ['pi', 'e']

    info_params = {
        'format': True,
        'variables': variables,
        'operators': operators,
        'constants': constants
    }

    PARTIAL_SCORE_DEFAULT: pl.PartialScore = {'score': None}
    score = data['partial_scores'].get(name, PARTIAL_SCORE_DEFAULT).get('score')

    if data['panel'] == 'question':
        editable = data['editable']
        raw_submitted_answer = data['raw_submitted_answers'].get(name)

        with open('pl-big-o-input.mustache', 'r', encoding='utf-8') as f:
            info = chevron.render(f, info_params).strip()

        if raw_submitted_answer is not None:
            raw_submitted_answer = escape(raw_submitted_answer)

        score_type, score_value = pl.determine_score_params(score)

        html_params = {
            'question': True,
            'name': name,
            'editable': editable,
            'info': info,
            'size': size,
            'show_info': pl.get_boolean_attrib(element, 'show-help-text', SHOW_HELP_TEXT_DEFAULT),
            'uuid': pl.get_uuid(),
            display.value: True,
            'show_placeholder': size >= PLACEHOLDER_TEXT_THRESHOLD,
            'raw_submitted_answer': raw_submitted_answer,
            'type': bigo_type,
            score_type: True,
            'score_value': score_value
        }

        with open('pl-big-o-input.mustache', 'r', encoding='utf-8') as f:
            return chevron.render(f, html_params).strip()

    elif data['panel'] == 'submission':
        parse_error: Optional[str] = data['format_errors'].get(name)
        missing_input = False
        feedback = None
        a_sub = None
        raw_submitted_answer = None

        if parse_error is None and name in data['submitted_answers']:
            a_sub = sympy.latex(sympy.sympify(data['submitted_answers'][name], evaluate=False))
            if name in data['partial_scores']:
                feedback = data['partial_scores'][name].get('feedback')
        elif name not in data['submitted_answers']:
            missing_input = True
            parse_error = None
        else:

            # Use the existing format text in the invalid popup.
            with open('pl-big-o-input.mustache', 'r', encoding='utf-8') as f:
                info = chevron.render(f, info_params).strip()

            # Render invalid popup
            raw_submitted_answer = data['raw_submitted_answers'].get(name)
            if isinstance(parse_error, str):
                with open('pl-big-o-input.mustache', 'r', encoding='utf-8') as f:
                    parse_error += chevron.render(f, {'format_error': True, 'format_string': info}).strip()
            if raw_submitted_answer is not None:
                raw_submitted_answer = pl.escape_unicode_string(raw_submitted_answer)

        score_type, score_value = pl.determine_score_params(score)

        html_params = {
            'submission': True,
            'type': bigo_type,
            'parse_error': parse_error,
            'uuid': pl.get_uuid(),
            display.value: True,
            'error': parse_error or missing_input,
            'a_sub': a_sub,
            'feedback': feedback,
            'raw_submitted_answer': raw_submitted_answer,
            score_type: True,
            'score_value': score_value
        }
        with open('pl-big-o-input.mustache', 'r', encoding='utf-8') as f:
            return chevron.render(f, html_params).strip()

    # Display the correct answer.
    elif data['panel'] == 'answer':
        a_tru = data['correct_answers'].get(name)
        if a_tru is not None:
            a_tru = sympy.sympify(a_tru)
            html_params = {
                'answer': True,
                'a_tru': sympy.latex(a_tru),
                'type': bigo_type
            }
            with open('pl-big-o-input.mustache', 'r', encoding='utf-8') as f:
                return chevron.render(f, html_params).strip()
        return ''

    assert_never(data['panel'])


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    variables = get_variables_list(pl.get_string_attrib(element, 'variables', VARIABLES_DEFAULT))

    a_sub = data['submitted_answers'].get(name)
    if a_sub is None:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = None
        return

    # Replace '^' with '**' wherever it appears.
    a_sub = a_sub.replace('^', '**')

    # Replace unicode minus with hyphen minus wherever it occurs
    a_sub = a_sub.replace(u'\u2212', '-')

    # Strip whitespace
    a_sub = a_sub.strip()

    s = phs.validate_string_as_sympy(a_sub, variables, allow_complex=False, allow_trig_functions=False)

    if s is None:
        data['submitted_answers'][name] = a_sub
    else:
        data['format_errors'][name] = s
        data['submitted_answers'][name] = None


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    variables = get_variables_list(pl.get_string_attrib(element, 'variables', VARIABLES_DEFAULT))
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)
    a_tru: str = data['correct_answers'].get(name, '')

    def get_grade_fn(grade_fn: bou.BigoGradingFunctionT) -> Callable[[str], Tuple[float, str]]:
        def grade(a_sub: str) -> Tuple[float, str]:
            return grade_fn(a_tru, a_sub, variables)
        return grade

    bigo_type = BigOType[pl.get_string_attrib(element, 'type', BigOType.BIG_O.name).upper()]

    if bigo_type is BigOType.BIG_O:
        pl.grade_question_parameterized(data, name, get_grade_fn(bou.grade_bigo_expression), weight=weight)
    elif bigo_type is BigOType.THETA:
        pl.grade_question_parameterized(data, name, get_grade_fn(bou.grade_theta_expression), weight=weight)
    elif bigo_type is BigOType.OMEGA:
        pl.grade_question_parameterized(data, name, get_grade_fn(bou.grade_omega_expression), weight=weight)
    elif bigo_type is BigOType.LITTLE_O:
        pl.grade_question_parameterized(data, name, get_grade_fn(bou.grade_little_o_expression), weight=weight)
    elif bigo_type is BigOType.LITTLE_OMEGA:
        pl.grade_question_parameterized(data, name, get_grade_fn(bou.grade_little_omega_expression), weight=weight)
    else:
        assert_never(bigo_type)


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)

    # Get raw correct answer
    a_tru = data['correct_answers'][name]

    result = data['test_type']
    if result == 'correct':
        data['raw_submitted_answers'][name] = a_tru
        data['partial_scores'][name] = {'score': 1, 'weight': weight, 'feedback': 'Correct!'}

    elif result == 'incorrect':
        data['raw_submitted_answers'][name] = f'{a_tru} + {random.randint(1, 100):d}'
        bigo_type = BigOType[pl.get_string_attrib(element, 'type', BigOType.BIG_O.name).upper()]

        data['partial_scores'][name] = \
            {'score': 0.5, 'weight': weight, 'feedback': 'Your answer is correct, but you have unnecessary lower order terms.'} if bigo_type is not BigOType.THETA else \
            {'score': 0.25, 'weight': weight, 'feedback': 'Incorrect, your answer has unnecessary lower order terms.'}

    elif result == 'invalid':
        invalid_type_choices: List[Literal['float', 'expression', 'function', 'variable', 'syntax', 'escape', 'comment']] = \
            ['float', 'expression', 'function', 'variable', 'syntax', 'escape', 'comment']

        invalid_type = random.choice(invalid_type_choices)

        # TODO add detailed format errors if this gets checked in the future
        if invalid_type == 'float':
            invalid_input = 'n + 1.234'
            data['raw_submitted_answers'][name] = invalid_input
            data['format_errors'][name] = ''

        elif invalid_type == 'expression':
            invalid_input = '1 and 0'
            data['raw_submitted_answers'][name] = invalid_input
            data['format_errors'][name] = ''

        elif invalid_type == 'function':
            invalid_input = 'tan(n)'
            data['raw_submitted_answers'][name] = invalid_input
            data['format_errors'][name] = ''

        elif invalid_type == 'variable':
            invalid_input = 'n + m'
            data['raw_submitted_answers'][name] = invalid_input
            data['format_errors'][name] = ''

        elif invalid_type == 'syntax':
            invalid_input = 'n +* 1'
            data['raw_submitted_answers'][name] = invalid_input
            data['format_errors'][name] = ''

        elif invalid_type == 'escape':
            invalid_input = 'n + 1\\n'
            data['raw_submitted_answers'][name] = invalid_input
            data['format_errors'][name] = ''

        elif invalid_type == 'comment':
            invalid_input = 'n # some text'
            data['raw_submitted_answers'][name] = invalid_input
            data['format_errors'][name] = ''

        else:
            assert_never(invalid_type)
    else:
        assert_never(result)


def get_variables_list(variables_string: str) -> List[str]:
    variables_list = [variable.strip() for variable in variables_string.split(',')]
    if variables_list == ['']:
        return []
    return variables_list
