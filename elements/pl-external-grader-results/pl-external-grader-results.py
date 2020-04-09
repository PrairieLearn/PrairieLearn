import prairielearn as pl
import lxml.html
import chevron
from ansi2html import Ansi2HTMLConverter
import ansi2html.style as ansi2html_style


# No built-in support for custom schemes, so we'll monkey-patch our own colors
# into the module. Colors borrowed from the "Dark Background" color preset in
# iTerm2; blue tweaked a bit for better legibility on black.
# order: black red green yellow blue magenta cyan white
# first set of 8 is normal, second set of 8 is bright
ansi2html_style.SCHEME['iterm'] = (
    '#000000', '#c91b00', '#00c200', '#c7c400',
    '#0037da', '#c930c7', '#00c5c7', '#c7c7c7',
    '#676767', '#ff6d67', '#5ff967', '#fefb67',
    '#6871ff', '#ff76ff', '#5ffdff', '#feffff',
) * 2
conv = Ansi2HTMLConverter(inline=True, scheme='iterm')


def ansi_to_html(output):
    if output is None:
        return None
    try:
        return conv.convert(output, full=False)
    except Exception as e:
        return f'[Error converting ANSI to HTML: {e}]\n\n{output}'


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = []
    pl.check_attribs(element, required_attribs, optional_attribs)


def render(element_html, data):
    if data['panel'] == 'submission':
        html_params = {'submission': True, 'graded': True, 'uuid': pl.get_uuid()}

        feedback = data['feedback']
        html_params['graded'] = bool(feedback)
        grading_succeeded = bool(feedback.get('succeeded', None))
        html_params['grading_succeeded'] = grading_succeeded

        # Gradable
        gradable = True
        if 'results' in feedback and 'gradable' in feedback['results']:
            gradable = feedback['results']['gradable']
        html_params['gradable'] = gradable

        # Format Errors
        format_errors = data.get('format_errors', {})
        grader_format_errors = format_errors.get('_external_grader', [])
        html_params['format_errors'] = grader_format_errors
        html_params['has_format_errors'] = len(grader_format_errors) > 0

        if not grading_succeeded:
            html_params['message'] = ansi_to_html(feedback.get('message', None))
        else:
            results = feedback.get('results', None)
            if grading_succeeded and results:
                html_params['succeeded'] = bool(results.get('succeeded', None))
                html_params['score'] = format(results.get('score', 0) * 100, '.2f').rstrip('0').rstrip('.')
                html_params['achieved_max_points'] = (results.get('score', 0) >= 1.0)
                html_params['results_color'] = '#4CAF50' if (results.get('score', 0) >= 1.0) else '#F44336'
                html_params['has_message'] = bool(results.get('message', False))
                html_params['message'] = ansi_to_html(results.get('message', None))
                html_params['has_output'] = bool(results.get('output', False))
                html_params['output'] = ansi_to_html(results.get('output', None))
                html_params['has_message_or_output'] = bool(html_params['has_message'] or html_params['has_output'])

                results_tests = results.get('tests', None)
                html_params['has_tests'] = bool(results.get('tests', None))
                if results_tests:
                    # Let's not assume that people give us a valid array of tests
                    # If any test is missing either points or max_points, we'll
                    # disable detailed scores for all questions
                    tests_missing_points = False
                    for test in results_tests:
                        if test.get('points', None) is None:
                            tests_missing_points = True
                        if test.get('max_points', None) is None:
                            tests_missing_points = True
                    html_params['tests_missing_points'] = tests_missing_points

                    if not tests_missing_points:
                        html_params['points'] = sum(test['points'] for test in results_tests)
                        html_params['max_points'] = sum(test['max_points'] for test in results_tests)

                    # We need to build a new tests array to massage data a bit
                    tests = []
                    for index, results_test in enumerate(results_tests):
                        test = {}
                        test['index'] = index
                        test['name'] = results_test.get('name', '')
                        test['has_message'] = bool(results_test.get('message', None))
                        test['message'] = ansi_to_html(results_test.get('message', None))
                        test['has_output'] = bool(results_test.get('output', None))
                        test['output'] = ansi_to_html(results_test.get('output', None))
                        test['has_description'] = bool(results_test.get('description', None))
                        test['description'] = results_test.get('description', None)
                        if not tests_missing_points:
                            test['max_points'] = results_test.get('max_points')
                            test['points'] = results_test.get('points')
                            correct = test['max_points'] == test['points']
                            test['results_color'] = '#4CAF50' if correct else '#F44336'
                            test['results_icon'] = 'fa-check' if correct else 'fa-times'
                        tests.append(test)

                    html_params['tests'] = tests

        with open('pl-external-grader-results.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    else:
        html = ''

    return html
