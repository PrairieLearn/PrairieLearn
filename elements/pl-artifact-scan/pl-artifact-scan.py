import prairielearn as pl
import lxml.html
import chevron
from enum import Enum

REQUIRED_DEFAULT = True

def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    # pl.check_attribs(element, required_attribs=['answers-name'], optional_attribs=['blank', 'weight', 'sort'])
    # answers_name = pl.get_string_attrib(element, 'answers-name')

    # Get answer from pl-answer if implemented
    # data['correct_answers'][answers_name] = get_solution(element, data)

    # if data['correct_answers'][answers_name] is None:
    #     raise Exception('Correct answer not defined for answers-name: %s' % answers_name)


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    uuid = pl.get_uuid()

    # if barcode is not None:
    #     try:
    #         score = float(score)
    #         if score == 1:
    #             correct = True
    #         else:
    #             correct = False
    #     except Exception:
    #         raise ValueError('invalid score' + score)

    if data['panel'] == 'question':

        html_params = {
            'question': True,
            'uuid': uuid,
        }

    elif data['panel'] == 'submission':
        html_params = {
            'uuid': uuid,
            # 'parse-error': data['format_errors'].get(answers_name, None),
            'submission': True,
            'barcode': 'some value'
        }

    elif data['panel'] == 'answer':
        html_params = {
            'answer': True
            # 'correct-answer': data['correct_answers'][answers_name]
        }

    with open('pl-artifact-scan.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()
    return html


def parse(element_html, data):
    # element = lxml.html.fragment_fromstring(element_html)

    # Blank option should be available, but cause format error when submitted.
    valid_options = [' ']
    return

    # if answer is None:
    #     data['format_errors'][answers_name] = 'No answer was submitted.'

    # if answer not in valid_options:
    #     data['format_errors'][answers_name] = 'Invalid option submitted.'


def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    answers_name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)
    submitted_answer = data['submitted_answers'].get(answers_name, None)

    if data['correct_answers'][answers_name] == submitted_answer:
        data['partial_scores'][answers_name] = {'score': 1, 'weight': weight}
    else:
        data['partial_scores'][answers_name] = {'score': 0, 'weight': weight}


def test(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    answers_name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)

    # solution is what the answer should be
    solution = get_solution(element, data)

    # incorrect and correct answer test cases
    if data['test_type'] == 'correct':
        data['raw_submitted_answers'][answers_name] = solution
        data['partial_scores'][answers_name] = {'score': 1, 'weight': weight}
    elif data['test_type'] == 'incorrect':
        dropdown_options = get_options(element, data)
        incorrect_ans = ''

        for option in dropdown_options:
            if option['value'] != solution:
                incorrect_ans = option['value']

        data['raw_submitted_answers'][answers_name] = incorrect_ans
        data['partial_scores'][answers_name] = {'score': 0, 'weight': weight}
    elif data['test_type'] == 'invalid':
        # Test for invalid drop-down options in case injection on front-end
        data['raw_submitted_answers'][answers_name] = 'INVALID STRING'
        data['format_errors'][answers_name] = 'format error message'
    else:
        raise Exception('invalid result: %s' % data['test_type'])
