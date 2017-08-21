import lxml.html
from html import escape
import chevron
import to_precision
import prairielearn as pl
import json

def get_dependencies(element_html, element_index, data):
    return {
        'styles': [
            'pl_external_grader_results.css'
        ]
    }

def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = []
    pl.check_attribs(element, required_attribs, optional_attribs)

    return data

def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)

    if data["panel"] == "submission":
        html_params = {'submission': True, 'graded': True, 'uuid': pl.get_uuid()}

        feedback = data['feedback']
        html_params['graded'] = bool(feedback)
        html_params['succeeded'] = bool(feedback.get('succeeded', None))

        results = feedback.get('results', None)
        if results:
            html_params['score'] = format(results.get('score') * 100, '.2f').rstrip('0').rstrip('.')
            html_params['achieved_max_points'] = (results['score'] == 1.0)
            html_params['results_color'] = '#4CAF50' if (results['score'] == 1.0) else '#F44336'
            html_params['has_message'] = bool(results.get('message', False))
            html_params['message'] = results.get('message', None)
            html_params['has_output'] = bool(results.get('output', False))
            html_params['output'] = results.get('output', None)
            html_params['has_message_or_output'] = bool(html_params['has_message'] or html_params['has_output'])

            results_tests = results.get('tests', None)
            html_params['has_tests'] = bool(results.get('tests', None))
            if results_tests:
                html_params['points'] = sum(test['points'] for test in results_tests)
                html_params['max_points'] = sum(test['max_points'] for test in results_tests)

                # We need to build a new tests array to massage data a bit
                tests = []
                for index, results_test in enumerate(results_tests):
                    test = {}
                    test['index'] = index
                    test['name'] = results_test.get('name', '')
                    test['has_message'] = bool(results_test.get('message', None))
                    test['message'] = results_test.get('message', None)
                    test['has_output'] = bool(results_test.get('output', None))
                    test['output'] = results_test.get('output', None)
                    test['max_points'] = results_test.get('max_points')
                    test['points'] = results_test.get('points')
                    correct = test['max_points'] == test['points']
                    test['results_color'] = '#4CAF50' if correct else '#F44336'
                    test['results_icon'] = 'glyphicon-ok' if correct else 'glyphicon-remove'
                    test['has_description'] = bool(results_test.get('description', None))
                    test['description'] = results_test.get('description', None)

                    tests.append(test)

                html_params['tests'] = tests

        with open('pl_external_grader_results.mustache', 'r') as f:
            html = chevron.render(f, html_params).strip()
    else:
        html = ""

    return html

def parse(element_html, element_index, data):
    return data

def grade(element_html, element_index, data):
    return data
