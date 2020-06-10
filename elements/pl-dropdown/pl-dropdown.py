import prairielearn as pl
import lxml.html
import random
import chevron
from enum import Enum

WEIGHT_DEFAULT = 1


class SortTypes(Enum):
    RANDOM = 'random'
    ASCEND = 'ascend'
    DESCEND = 'descend'


def get_options(element, data, correct_answer):
    # server.py params values override pl-answer options
    options = data['params'].get(correct_answer, [])
    if not options:
        options = []
        for child in element:
            if child.tag in ['pl-answer']:
                pl.check_attribs(child, required_attribs=[], optional_attribs=['correct'])
                child_html = pl.inner_html(child).strip()
                options.append(child_html)
    return options


def get_solution(element, data, correct_answer):
    # server.py correct_answers value overrides correct pl-answer value
    solution = data['correct_answers'].get(correct_answer, [])
    if not solution:
        for child in element:
            if child.tag in ['pl-answer']:
                pl.check_attribs(child, required_attribs=[], optional_attribs=['correct'])
                is_correct = pl.get_boolean_attrib(child, 'correct', False)
                child_html = pl.inner_html(child).strip()
                if is_correct:
                    solution = child_html
    return solution


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=['correct-answer'], optional_attribs=['weight', 'sort'])
    correct_answer = pl.get_string_attrib(element, 'correct-answer')

    # Get answer from pl-answer if implemented
    data['correct_answers'][correct_answer] = get_solution(element, data, correct_answer)

    # Get answer from server.py if pl-answer not implemented
    if correct_answer is None:
        data['correct_answers'][correct_answer] = correct_answer

    if data['correct_answers'][correct_answer] is None:
        raise Exception('Correct answer not defined for correct-answer: %s' % correct_answer)


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    correct_answer = pl.get_string_attrib(element, 'correct-answer')
    dropdown_options = get_options(element, data, correct_answer)

    sort_type = pl.get_string_attrib(element, 'sort', '').upper().strip()
    html_params = {}
    html = ''

    if data['panel'] == 'question':
        if sort_type == SortTypes.DESCEND.name:
            dropdown_options.sort(reverse=True)
        elif sort_type == SortTypes.ASCEND.name:
            dropdown_options.sort(reverse=False)
        elif sort_type == SortTypes.RANDOM.name:
            random.shuffle(dropdown_options)

        html_params = {
            'question': True,
            'uuid': pl.get_uuid(),
            'options': dropdown_options,
            'correct-answer': correct_answer
        }
    elif data['panel'] == 'submission':
        html_params = {
            'submission': True,
            'submitted-answer': data['submitted_answers'].get(correct_answer, None),
            'correct-answer': correct_answer
        }
    elif data['panel'] == 'answer':
        correct_answer = pl.get_string_attrib(element, 'correct-answer')
        submitted_answer = data['submitted_answers'].get(correct_answer, None)

        html_params = {
            'answer': True,
            'submitted-answer': submitted_answer,
            'solution': data['correct_answers'][correct_answer],
            'correct': data['correct_answers'][correct_answer] == submitted_answer
        }

    with open('pl-dropdown.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()
    return html


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    correct_answer = pl.get_string_attrib(element, 'correct-answer')
    answer = data['submitted_answers'].get(correct_answer, None)
    valid_options = []

    for child in element:
        if child.tag in ['pl-answer']:
            pl.check_attribs(child, required_attribs=[], optional_attribs=['correct'])
            child_html = pl.inner_html(child).strip()
            valid_options.append(child_html)

    if answer is None:
        data['format_errors'][correct_answer] = 'No answer was submitted.'

    if answer not in valid_options:
        data['format_errors'][correct_answer] = 'Invalid answer submitted.'


def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    correct_answer = pl.get_string_attrib(element, 'correct-answer')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)
    submitted_answer = data['submitted_answers'].get(correct_answer, None)

    if data['correct_answers'][correct_answer] == submitted_answer:
        data['partial_scores'][correct_answer] = {'score': 1, 'weight': weight}
    else:
        data['partial_scores'][correct_answer] = {'score': 0, 'weight': weight}


def test(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    correct_answer = pl.get_string_attrib(element, 'correct-answer')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)

    # solution is what the answer should be
    solution = get_solution(element, data, correct_answer)

    # incorrect and correct answer test cases
    if data['test_type'] == 'correct':
        data['raw_submitted_answers'][correct_answer] = solution
        data['partial_scores'][correct_answer] = {'score': 1, 'weight': weight}
    elif data['test_type'] == 'incorrect':
        dropdown_options = get_options(element, data, correct_answer)
        incorrect_ans = ''

        for option in dropdown_options:
            if option != solution:
                incorrect_ans = option

        data['raw_submitted_answers'][correct_answer] = incorrect_ans
        data['partial_scores'][correct_answer] = {'score': 0, 'weight': weight}
    elif data['test_type'] == 'invalid':
        # Test for invalid drop-down options in case injection on front-end
        data['raw_submitted_answers'][correct_answer] = 'INVALID STRING'
        data['format_errors'][correct_answer] = 'format error message'
    else:
        raise Exception('invalid result: %s' % data['test_type'])
