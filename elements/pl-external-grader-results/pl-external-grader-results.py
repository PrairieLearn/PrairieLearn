import prairielearn as pl
import lxml.html
import chevron


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
        if not grading_succeeded:
            html_params['message'] = feedback.get('message', None)
        else:
            results = feedback.get('results', None)
            if grading_succeeded and results:
                html_params['succeeded'] = bool(results.get('succeeded', None))
                html_params['score'] = format(results.get('score', 0) * 100, '.2f').rstrip('0').rstrip('.')
                html_params['achieved_max_points'] = (results.get('score', 0) >= 1.0)
                html_params['results_color'] = '#4CAF50' if (results.get('score', 0) >= 1.0) else '#F44336'
                html_params['has_message'] = bool(results.get('message', False))
                html_params['message'] = results.get('message', None)
                html_params['has_output'] = bool(results.get('output', False))
                html_params['output'] = results.get('output', None)
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
                        test['message'] = results_test.get('message', None)
                        test['has_output'] = bool(results_test.get('output', None))
                        test['output'] = results_test.get('output', None)
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
