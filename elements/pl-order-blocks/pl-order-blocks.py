import prairielearn as pl
import lxml.html
import random
import chevron
import base64
import os
import json
import math

PL_ANSWER_CORRECT_DEFAULT = True
PL_ANSWER_INDENT_DEFAULT = -1
INDENTION_DEFAULT = False
SOURCE_BLOCKS_ORDER_DEFAULT = 'random'
GRADING_METHOD_DEFAULT = 'ordered'
SOURCE_HEADER_DEFAULT = 'Drag from here:'
SOLUTION_HEADER_DEFAULT = 'Drop blocks here:'
FILE_NAME_DEFAULT = 'user_code.py'
SOLUTION_PLACEMENT_DEFAULT = 'right'
WEIGHT_DEFAULT = 1
INDENT_OFFSET = 7
TAB_SIZE_PX = 50


def filter_keys_from_array(data, key):
    result = []
    for item in data:
        result.append(item[key])
    return result


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    answer_name = pl.get_string_attrib(element, 'answers-name')

    required_attribs = ['answers-name']
    optional_attribs = ['source-blocks-order', 'grading-method', 'indentation', 'source-header', 'solution-header', 'file-name', 'solution-placement', 'max-incorrect', 'min-incorrect', 'weight']

    pl.check_attribs(element, required_attribs=required_attribs, optional_attribs=optional_attribs)

    correct_answers = []
    incorrect_answers = []

    check_indentation = pl.get_boolean_attrib(element, 'indentation', INDENTION_DEFAULT)
    grading_method = pl.get_string_attrib(element, 'grading-method', GRADING_METHOD_DEFAULT)

    accepted_grading_method = ['ordered', 'unordered', 'ranking', 'external']
    if grading_method not in accepted_grading_method:
        raise Exception('The grading-method attribute must be one of the following: ' + accepted_grading_method)

    index = 0
    for html_tags in element:  # iterate through the html tags inside pl-order-blocks, should be all <pl-answer> tags
        if html_tags.tag != 'pl-answer':
            raise Exception('Any html tags nested inside <pl-order-blocks> must be <pl-answer>.')

        if grading_method == 'external':
            pl.check_attribs(html_tags, required_attribs=[], optional_attribs=['correct'])
        else:
            pl.check_attribs(html_tags, required_attribs=[], optional_attribs=['correct', 'ranking', 'indent'])

        is_correct = pl.get_boolean_attrib(html_tags, 'correct', PL_ANSWER_CORRECT_DEFAULT)
        answer_indent = pl.get_integer_attrib(html_tags, 'indent', None)
        inner_html = pl.inner_html(html_tags)
        ranking = pl.get_integer_attrib(html_tags, 'ranking', -1) - 1

        answer_data_dict = {'inner_html': inner_html,
                            'indent': answer_indent,
                            'ranking': ranking,
                            'index': index}

        if check_indentation is False and answer_indent is not None:
            raise Exception('<pl-answer> should not specify indentation if indentation is disabled.')

        if is_correct:
            correct_answers.append(answer_data_dict)
        else:
            incorrect_answers.append(answer_data_dict)
        index += 1

    if pl.get_string_attrib(element, 'grading-method', GRADING_METHOD_DEFAULT) != 'external' and len(correct_answers) == 0:
        raise Exception('There are no correct answers specified for this question.')

    all_incorrect_answers = len(incorrect_answers)
    max_incorrect = pl.get_integer_attrib(element, 'max-incorrect', all_incorrect_answers)
    min_incorrect = pl.get_integer_attrib(element, 'min-incorrect', all_incorrect_answers)

    if min_incorrect > len(incorrect_answers) or max_incorrect > len(incorrect_answers):
        raise Exception('The min-incorrect or max-incorrect attribute may not exceed the number of incorrect <pl-answers>.')
    if min_incorrect > max_incorrect:
        raise Exception('The attribute min-incorrect must be smaller than max-incorrect.')

    incorrect_answers_count = random.randint(min_incorrect, max_incorrect)

    sampled_correct_answers = correct_answers
    sampled_incorrect_answers = random.sample(incorrect_answers, incorrect_answers_count)

    mcq_options = sampled_correct_answers + sampled_incorrect_answers

    source_blocks_order = pl.get_string_attrib(element, 'source-blocks-order', SOURCE_BLOCKS_ORDER_DEFAULT)
    if source_blocks_order == 'random':
        random.shuffle(mcq_options)
    elif source_blocks_order == 'ordered':
        mcq_options.sort(key=lambda a: a['index'])
    else:
        raise Exception('the selected option for "source-blocks-order" does not exist.')

    data['params'][answer_name] = filter_keys_from_array(mcq_options, 'inner_html')
    data['correct_answers'][answer_name] = correct_answers


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    answer_name = pl.get_string_attrib(element, 'answers-name')

    if data['panel'] == 'question':
        mcq_options = []
        student_previous_submission = []
        submission_indent = []
        student_submission_dict_list = []

        answer_name = pl.get_string_attrib(element, 'answers-name')
        source_header = pl.get_string_attrib(element, 'source-header', SOURCE_HEADER_DEFAULT)
        solution_header = pl.get_string_attrib(element, 'solution-header', SOLUTION_HEADER_DEFAULT)
        grading_method = pl.get_string_attrib(element, 'grading-method', GRADING_METHOD_DEFAULT)

        mcq_options = data['params'][answer_name]

        if answer_name in data['submitted_answers']:
            student_previous_submission = filter_keys_from_array(data['submitted_answers'][answer_name], 'inner_html')
            mcq_options = list(set(mcq_options) - set(student_previous_submission))

        for index, mcq_options_text in enumerate(student_previous_submission):
            submission_indent = filter_keys_from_array(data['submitted_answers'][answer_name], 'indent')[index]
            submission_indent = (int(submission_indent) * TAB_SIZE_PX) + INDENT_OFFSET
            temp = {'text': mcq_options_text, 'indent': submission_indent}
            student_submission_dict_list.append(dict(temp))

        dropzone_layout = pl.get_string_attrib(element, 'solution-placement', SOLUTION_PLACEMENT_DEFAULT)
        check_indentation = pl.get_boolean_attrib(element, 'indentation', INDENTION_DEFAULT)

        help_text = 'Drag answer tiles into the answer area to the ' + dropzone_layout + '. '

        if grading_method == 'unordered':
            help_text += '<br>Your answer ordering does not matter. '
        elif grading_method != 'external':
            help_text += '<br>The ordering of your answer matters and is graded.'
        else:
            help_text += '<br>Your answer will be autograded; be sure to indent and order your answer properly.'

        if check_indentation:
            help_text += '<br><b>Your answer should be indented. </b> Indent your tiles by dragging them horizontally in the answer area.'

        html_params = {
            'question': True,
            'answer_name': answer_name,
            'options': mcq_options,
            'source-header': source_header,
            'solution-header': solution_header,
            'submission_dict': student_submission_dict_list,
            'dropzone_layout': 'pl-order-blocks-bottom' if dropzone_layout == 'bottom' else 'pl-order-blocks-right',
            'check_indentation': 'enableIndentation' if check_indentation is True else None,
            'help_text': help_text
        }

        with open('pl-order-blocks.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params)
        return html

    elif data['panel'] == 'submission':
        if pl.get_string_attrib(element, 'grading-method', 'ordered') == 'external':
            return 'Your result is externally graded. Check the external grader for your score.'

        student_submission = ''
        score = 0
        feedback = None

        if answer_name in data['submitted_answers']:
            student_submission = filter_keys_from_array(data['submitted_answers'][answer_name], 'inner_html')
        if answer_name in data['partial_scores']:
            score = data['partial_scores'][answer_name]['score']
            feedback = data['partial_scores'][answer_name]['feedback']

        html_params = {
            'submission': True,
            'parse-error': data['format_errors'].get(answer_name, None),
            'student_submission': student_submission,
            'feedback': feedback
        }

        try:
            score = float(score * 100)
            if score >= 100:
                html_params['correct'] = True
            elif score > 0:
                html_params['partially_correct'] = math.floor(score)
            else:
                html_params['incorrect'] = True
        except Exception:
            raise ValueError('invalid score: ' + data['partial_scores'][answer_name]['score'])

        with open('pl-order-blocks.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params)
        return html

    elif data['panel'] == 'answer':
        if pl.get_string_attrib(element, 'grading-method', 'ordered') == 'external':
            try:
                base_path = data['options']['question_path']
                file_lead_path = os.path.join(base_path, 'tests/ans.py')
                with open(file_lead_path, 'r') as file:
                    solution_file = file.read()
                return f'<pl-code language="python">{solution_file}</pl-code>'
            except FileNotFoundError:
                return 'The reference solution is not provided for this question.'

        grading_mode = pl.get_string_attrib(element, 'grading-method', 'ordered')
        grading_mode = 'in any order' if grading_mode == 'unordered' else 'in the specified order'

        check_indentation = pl.get_boolean_attrib(element, 'indentation', INDENTION_DEFAULT)
        check_indentation = ', with correct indentation' if check_indentation is True else None

        if answer_name in data['correct_answers']:
            html_params = {
                'true_answer': True,
                'question_solution': filter_keys_from_array(data['correct_answers'][answer_name], 'inner_html'),
                'grading_mode': grading_mode,
                'check_indentation': check_indentation
            }
            with open('pl-order-blocks.mustache', 'r', encoding='utf-8') as f:
                html = chevron.render(f, html_params)
            return html
        else:
            return ''


def parse(element_html, data):
    # FIX ME
    element = lxml.html.fragment_fromstring(element_html)
    answer_name = pl.get_string_attrib(element, 'answers-name')

    answer_raw_name = answer_name + '-input'
    student_answer = ''

    if answer_raw_name in data['raw_submitted_answers']:
        student_answer = data['raw_submitted_answers'][answer_raw_name]
    if student_answer is None or student_answer == '':
        data['format_errors'][answer_name] = 'No answer was submitted.'
        return

    grading_mode = pl.get_string_attrib(element, 'grading-method', GRADING_METHOD_DEFAULT)
    student_answer = json.loads(student_answer)
    correct_answers = data['correct_answers'][answer_name]

    if grading_mode == 'ranking':
        index = 0
        for answer in student_answer:
            search = next((item for item in correct_answers if item["inner_html"] == answer['inner_html']), None)
            if search is not None:
                ranking = search['ranking']
            else:
                ranking = -1   # wrong answers have no ranking
            student_answer[index]['ranking'] = ranking
            index += 1

    if pl.get_string_attrib(element, 'grading-method', 'ordered') == 'external':
        for html_tags in element:
            if html_tags.tag == 'pl-answer':
                pl.check_attribs(html_tags, required_attribs=[], optional_attribs=[])
        file_name = pl.get_string_attrib(element, 'file-name', FILE_NAME_DEFAULT)

        answer_code = ''
        for index, answer in enumerate(student_answer):
            student_answer_indent = filter_keys_from_array(student_answer, 'indent')
            indent = int(student_answer_indent[index])
            answer_code += ('    ' * indent) + answer + '\n'

        if len(answer_code) == 0:
            data['format_errors']['_files'] = 'The submitted file was empty.'
        else:
            data['submitted_answers']['_files'] = [{'name': file_name, 'contents': base64.b64encode(answer_code.encode('utf-8')).decode('utf-8')}]

    data['submitted_answers'][answer_name] = student_answer
    if answer_raw_name in data['submitted_answers']:
        del data['submitted_answers'][answer_raw_name]


def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    answer_name = pl.get_string_attrib(element, 'answers-name')

    student_answer = data['submitted_answers'][answer_name]
    grading_mode = pl.get_string_attrib(element, 'grading-method', GRADING_METHOD_DEFAULT)
    check_indentation = pl.get_boolean_attrib(element, 'indentation', INDENTION_DEFAULT)
    answer_weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)

    true_answer_list = filter_keys_from_array(data['correct_answers'][answer_name], 'inner_html')

    indent_score = 0
    final_score = 0
    feedback = ''

    if len(student_answer) == 0:
        data['format_errors'][answer_name] = 'Your submitted answer was empty.'
        return

    if grading_mode == 'unordered':
        student_answer = filter_keys_from_array(student_answer, 'inner_html')
        correct_selections = list(set(student_answer) & set(true_answer_list))
        incorrect_selections = list(set(student_answer) - set(true_answer_list))
        final_score = float((len(correct_selections) - len(incorrect_selections)) / len(true_answer_list))
        final_score = max(0.0, final_score)  # scores cannot be below 0
    elif grading_mode == 'ordered':
        student_answer = filter_keys_from_array(student_answer, 'inner_html')
        final_score = 1.0 if student_answer == true_answer_list else 0.0
    elif grading_mode == 'ranking':
        ranking = filter_keys_from_array(data['submitted_answers'][answer_name], 'ranking')
        correctness = 1 + ranking.count(0)
        partial_credit = 0
        if len(ranking) != 0 and len(ranking) == len(true_answer_list):
            ranking = list(filter(lambda x: x != 0, ranking))
            for x in range(0, len(ranking) - 1):
                if int(ranking[x]) == int(ranking[x + 1]) or int(ranking[x]) + 1 == int(ranking[x + 1]):
                    correctness += 1
        else:
            correctness = 0
        correctness = max(correctness, partial_credit)
        final_score = float(correctness / len(true_answer_list))

    if check_indentation:
        student_answer_indent = filter_keys_from_array(data['submitted_answers'][answer_name], 'indent')
        true_answer_indent = filter_keys_from_array(data['correct_answers'][answer_name], 'indent')
        for i, indent in enumerate(student_answer_indent):
            if true_answer_indent[i] == '-1' or int(indent) == true_answer_indent[i]:
                indent_score += 1
        final_score = final_score * (indent_score / len(true_answer_indent))
    data['partial_scores'][answer_name] = {'score': round(final_score, 2), 'feedback': feedback, 'weight': answer_weight}


def test(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    answer_name = pl.get_string_attrib(element, 'answers-name')
    answer_name_field = answer_name + '-input'

    # incorrect and correct answer test cases
    # this creates the EXPECTED SUBMISSION field for test cases
    if data['test_type'] == 'correct':
        true_answer = data['correct_answers'][answer_name]['correct_answers']
        true_answer_indent = data['correct_answers'][answer_name]['correct_answers_indent']

        data['raw_submitted_answers'][answer_name_field] = {'answers': true_answer, 'answer_indent': true_answer_indent}
        data['partial_scores'][answer_name] = {'score': 1, 'feedback': ''}
    elif data['test_type'] == 'incorrect':
        temp = data['correct_answers'][answer_name]['correct_answers'].copy()  # temp array to hold the correct answers
        incorrect_answers = []
        for html_tags in element:
            if html_tags.tag == 'pl-answer':
                incorrect_answers.append(html_tags.text)
        incorrect_answers = list(filter(lambda x: x not in temp, incorrect_answers))

        incorrect_answers_indent = ['0'] * len(incorrect_answers)
        data['raw_submitted_answers'][answer_name_field] = {'answers': incorrect_answers, 'answer_indent': incorrect_answers_indent}
        data['partial_scores'][answer_name] = {'score': 0, 'feedback': ''}

    elif data['test_type'] == 'invalid':
        data['raw_submitted_answers'][answer_name] = 'bad input'
        data['format_errors'][answer_name] = 'format error message'
    else:
        raise Exception('invalid result: %s' % data['test_type'])
