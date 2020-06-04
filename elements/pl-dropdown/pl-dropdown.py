import prairielearn as pl
import lxml.html
import json
import random
import chevron
import os
from enum import Enum

WEIGHT_DEFAULT = 1

class SortTypes(Enum): 
    RANDOM = 'random'
    ASCEND = 'ascend'
    DESCEND = 'descend'

def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=['options', 'answer-key'], optional_attribs=['weight', 'answer', 'sort'])
    answer_key = pl.get_string_attrib(element, 'answer-key')
    correct_answer = pl.get_string_attrib(element, 'answer', None)

    ## Set correct answer from HTML attrib if given
    if correct_answer != None:
        data['correct_answers'][answer_key] = correct_answer

    if data['correct_answers'][answer_key] == None:
        raise Exception('Correct answer not defined for answer-key: %s' % answer_key)

def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    dropdown_options = json.loads(pl.get_string_attrib(element, 'options'))
    sort = pl.get_string_attrib(element, 'sort', '').upper().strip()

    answer_key = pl.get_string_attrib(element, 'answer-key')
    html_params = {}
    html = ''

    if data['panel'] == 'question':
        if sort == SortTypes.DESCEND.name:
            dropdown_options.sort(reverse=True)
        elif sort == SortTypes.ASCEND.name:
            dropdown_options.sort(reverse=False)
        elif sort == SortTypes.RANDOM.name: 
            random.shuffle(dropdown_options)

        html_params = {
            'question': True,
            'uuid': pl.get_uuid(),
            'options': dropdown_options,
            'answer-key': answer_key
        }
    elif data['panel'] == 'submission':
        html_params = {
            'submission': True,
            'submitted_answer': data['submitted_answers'].get(answer_key, None),
            'answer_key': answer_key
        }
    elif data['panel'] == 'answer':
        answer_key = pl.get_string_attrib(element, 'answer-key')
        submitted_answer = data['submitted_answers'].get(answer_key, None)
        name = pl.get_string_attrib(element, 'answer-key')

        html_params = {
            'answer': True,
            'submitted_answer': submitted_answer,
            'correct_answer': data['correct_answers'][name],
            'correct': data['correct_answers'][name] == submitted_answer
        }

    with open('pl-dropdown.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()
    return html

def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    answer_key = pl.get_string_attrib(element, 'answer-key')
    answer = data['submitted_answers'].get(answer_key, None)

    valid_options = json.loads(pl.get_string_attrib(element, 'options'))

    if answer is None:
        data['format_errors'][answer_key] = 'No answer was submitted.'
    
    if answer not in valid_options:
        data['format_errors'][answer_key] = 'Invalid answer submitted.'
    

def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answer-key')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)
    submitted_answer = data['submitted_answers'].get(name, None)
    
    if data['correct_answers'][name] == submitted_answer:
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    else:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}

def test(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    answer_key = pl.get_string_attrib(element, 'answer-key')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)

    ## correct_answer is what the answer should be
    correct_answer = data['correct_answers'][answer_key]
    
    ## incorrect and correct answer test cases
    if data['test_type'] == 'correct':
        data['raw_submitted_answers'][answer_key] = data['correct_answers'][answer_key]
        data['partial_scores'][answer_key] = {'score': 1, 'weight': weight}
    elif data['test_type'] == 'incorrect':
        dropdown_options = json.loads(pl.get_string_attrib(element, 'options'))
        incorrect_ans = ''

        for option in dropdown_options:
            if option != data['correct_answers'][answer_key]:
                incorrect_ans = option

        data['raw_submitted_answers'][answer_key] = incorrect_ans
        data['partial_scores'][answer_key] = {'score': 0, 'weight': weight}
    elif data['test_type'] == 'invalid':
        ## Test for invalid drop-down options in case injection on front-end
        data['raw_submitted_answers'][answer_key] = 'INVALID STRING'
        data['format_errors'][answer_key] = 'format error message'
    else:
        raise Exception('invalid result: %s' % data['test_type'])