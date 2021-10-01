import prairielearn as pl
import lxml.html
import chevron
from enum import Enum

BARCODE = 'barcode'
BLANK_ANSWER = ''
REQUIRED = 'required'
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

    if data['panel'] == 'question':
        html_params = {
            'question': True,
            'uuid': uuid,
        }
    else:
        html_params = {
            'uuid': uuid,
            'question': False,
            'parse-error': data['format_errors'].get(BARCODE, None),
            'barcode': data['submitted_answers'].get(BARCODE, '').strip()
        }

    with open('pl-artifact-scan.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()
    return html


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    submitted_barcode = data['submitted_answers'].get(BARCODE, '').strip()
    required = pl.get_boolean_attrib(element, REQUIRED, REQUIRED_DEFAULT)

    if submitted_barcode != '' and submitted_barcode.isnumeric() is False:
        data['format_errors'][BARCODE] = 'Barcode "' + submitted_barcode + '" is not a valid number.'
    if submitted_barcode is BLANK_ANSWER and required is True:
        data['format_errors'][BARCODE] = 'The barcode is required for this submission.'
