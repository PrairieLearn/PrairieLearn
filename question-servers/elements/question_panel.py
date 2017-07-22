import random, lxml.html
import prairielearn

def prepare(element_html, element_index, question_data):
    return question_data

def render(element_html, element_index, question_data):
    if question_data["panel"] == 'question':
        return element_html
    else:
        return ''

def parse(element_html, element_index, question_data):
    return question_data

def grade(element_html, element_index, question_data):
    return question_data
