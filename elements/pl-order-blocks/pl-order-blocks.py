import prairielearn as pl
import lxml.html
from lxml import etree
import random
import chevron
import base64
import os
import json
import math
from dag_checker import grade_dag, lcs_partial_credit

PL_ANSWER_CORRECT_DEFAULT = True
PL_ANSWER_INDENT_DEFAULT = -1
INDENTION_DEFAULT = False
MAX_INDENTION_DEFAULT = 4
SOURCE_BLOCKS_ORDER_DEFAULT = 'random'
GRADING_METHOD_DEFAULT = 'ordered'
FEEDBACK_DEFAULT = 'none'
SOURCE_HEADER_DEFAULT = 'Drag from here:'
SOLUTION_HEADER_DEFAULT = 'Construct your solution here:'
FILE_NAME_DEFAULT = 'user_code.py'
SOLUTION_PLACEMENT_DEFAULT = 'right'
INLINE_DEFAULT = False
WEIGHT_DEFAULT = 1
INDENT_OFFSET = 0
TAB_SIZE_PX = 50

FIRST_WRONG_FEEDBACK = {
    'incomplete': 'Your answer is correct so far, but it is incomplete.',
    'wrong-at-block': r"""Your answer is incorrect starting at <span style="color:red;">block number {}</span>.
        The problem is most likely one of the following:
        <ul><li> This block is not a part of the correct solution </li>
        <li>This block needs to come after a block that did not appear before it </li>""",
    'indentation': r"""<li>This line is indented incorrectly </li>""",
    'block-group': r"""<li> You have attempted to start a new section of the answer without finishing the previous section </li>"""
}


def filter_multiple_from_array(data, keys):
    return [{key: item[key] for key in keys} for item in data]


def get_graph_info(html_tags):
    tag = pl.get_string_attrib(html_tags, 'tag', pl.get_uuid())
    depends = pl.get_string_attrib(html_tags, 'depends', '')
    depends = depends.strip().split(',') if depends else []
    return tag, depends


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    answer_name = pl.get_string_attrib(element, 'answers-name')

    required_attribs = ['answers-name']
    optional_attribs = ['source-blocks-order', 'grading-method',
                        'indentation', 'source-header',
                        'solution-header', 'file-name',
                        'solution-placement', 'max-incorrect',
                        'min-incorrect', 'weight',
                        'inline', 'max-indent',
                        'feedback', 'partial-credit']

    pl.check_attribs(element, required_attribs=required_attribs, optional_attribs=optional_attribs)

    check_indentation = pl.get_boolean_attrib(element, 'indentation', INDENTION_DEFAULT)
    grading_method = pl.get_string_attrib(element, 'grading-method', GRADING_METHOD_DEFAULT)
    feedback_type = pl.get_string_attrib(element, 'feedback', FEEDBACK_DEFAULT)

    if grading_method in ['dag', 'ranking']:
        partial_credit_type = pl.get_string_attrib(element, 'partial-credit', 'lcs')
        if partial_credit_type not in ['none', 'lcs']:
            raise Exception('partial credit type "' + partial_credit_type + '" is not available with the "' + grading_method + '" grading-method.')
    elif pl.get_string_attrib(element, 'partial-credit', None) is not None:
        raise Exception('You may only specify partial credit options in the DAG and ranking grading modes.')

    accepted_grading_method = ['ordered', 'unordered', 'ranking', 'dag', 'external']
    if grading_method not in accepted_grading_method:
        raise Exception('The grading-method attribute must be one of the following: ' + ', '.join(accepted_grading_method))

    if (grading_method not in ['dag', 'ranking'] and feedback_type != 'none') or \
       (grading_method in ['dag', 'ranking'] and feedback_type not in ['none', 'first-wrong']):
        raise Exception('feedback type "' + feedback_type + '" is not available with the "' + grading_method + '" grading-method.')

    correct_answers = []
    incorrect_answers = []

    def prepare_tag(html_tags, index, group_info={'tag': None, 'depends': None}):
        if html_tags.tag != 'pl-answer':
            raise Exception('Any html tags nested inside <pl-order-blocks> must be <pl-answer> or <pl-block-group>. \
                Any html tags nested inside <pl-block-group> must be <pl-answer>')

        if grading_method == 'external':
            pl.check_attribs(html_tags, required_attribs=[], optional_attribs=['correct'])
        elif grading_method == 'unordered':
            pl.check_attribs(html_tags, required_attribs=[], optional_attribs=['correct', 'indent'])
        elif grading_method in ['ranking', 'ordered']:
            pl.check_attribs(html_tags, required_attribs=[], optional_attribs=['correct', 'ranking', 'indent'])
        elif grading_method == 'dag':
            pl.check_attribs(html_tags, required_attribs=[], optional_attribs=['correct', 'tag', 'depends', 'comment', 'indent'])

        is_correct = pl.get_boolean_attrib(html_tags, 'correct', PL_ANSWER_CORRECT_DEFAULT)
        answer_indent = pl.get_integer_attrib(html_tags, 'indent', None)
        inner_html = pl.inner_html(html_tags)
        ranking = pl.get_integer_attrib(html_tags, 'ranking', -1)

        tag, depends = get_graph_info(html_tags)
        if grading_method == 'ranking':
            tag = str(index)

        if check_indentation is False and answer_indent is not None:
            raise Exception('<pl-answer> should not specify indentation if indentation is disabled.')

        answer_data_dict = {'inner_html': inner_html,
                            'indent': answer_indent,
                            'ranking': ranking,
                            'index': index,
                            'tag': tag,          # set by HTML with DAG grader, set internally for ranking grader
                            'depends': depends,  # only used with DAG grader
                            'group_info': group_info  # only used with DAG grader
                            }
        if is_correct:
            correct_answers.append(answer_data_dict)
        else:
            incorrect_answers.append(answer_data_dict)

    index = 0
    for html_tags in element:  # iterate through the html tags inside pl-order-blocks
        if html_tags.tag is etree.Comment:
            continue
        elif html_tags.tag == 'pl-block-group':
            if grading_method != 'dag':
                raise Exception('Block groups only supported in the "dag" grading mode.')

            group_tag, group_depends = get_graph_info(html_tags)
            for grouped_tag in html_tags:
                if html_tags.tag is etree.Comment:
                    continue
                else:
                    prepare_tag(grouped_tag, index, {'tag': group_tag, 'depends': group_depends})
                    index += 1
        else:
            prepare_tag(html_tags, index)
            index += 1

    if grading_method != 'external' and len(correct_answers) == 0:
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
        raise Exception('The specified option for the "source-blocks-order" attribute is invalid.')

    # data['params'][answer_name] = filter_keys_from_array(mcq_options, 'inner_html')
    for option in mcq_options:
        option['uuid'] = pl.get_uuid()

    data['params'][answer_name] = mcq_options
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
        mcq_options = filter_multiple_from_array(mcq_options, ['inner_html', 'uuid'])

        if answer_name in data['submitted_answers']:
            student_previous_submission = filter_multiple_from_array(data['submitted_answers'][answer_name], ['inner_html', 'uuid', 'indent'])
            mcq_options = [opt for opt in mcq_options if opt not in filter_multiple_from_array(student_previous_submission, ['inner_html', 'uuid'])]

        for index, option in enumerate(student_previous_submission):
            submission_indent = option.get('indent', None)
            if submission_indent is not None:
                submission_indent = (int(submission_indent) * TAB_SIZE_PX) + INDENT_OFFSET
            temp = {'inner_html': option['inner_html'], 'indent': submission_indent, 'uuid': option['uuid']}
            student_submission_dict_list.append(dict(temp))

        dropzone_layout = pl.get_string_attrib(element, 'solution-placement', SOLUTION_PLACEMENT_DEFAULT)
        check_indentation = pl.get_boolean_attrib(element, 'indentation', INDENTION_DEFAULT)
        max_indent = pl.get_integer_attrib(element, 'max-indent', MAX_INDENTION_DEFAULT)
        inline_layout = pl.get_boolean_attrib(element, 'inline', INLINE_DEFAULT)

        help_text = 'Drag answer tiles into the answer area to the ' + dropzone_layout + '. '

        if grading_method == 'unordered':
            help_text += '<br>Your answer ordering does not matter. '
        elif grading_method != 'external':
            help_text += '<br>The ordering of your answer matters and is graded.'
        else:
            help_text += '<br>Your answer will be autograded; be sure to indent and order your answer properly.'

        if check_indentation:
            help_text += '<br><b>Your answer should be indented. </b> Indent your tiles by dragging them horizontally in the answer area.'

        uuid = pl.get_uuid()
        html_params = {
            'question': True,
            'answer_name': answer_name,
            'options': mcq_options,
            'source-header': source_header,
            'solution-header': solution_header,
            'submission_dict': student_submission_dict_list,
            'dropzone_layout': 'pl-order-blocks-bottom' if dropzone_layout == 'bottom' else 'pl-order-blocks-right',
            'check_indentation': 'true' if check_indentation else 'false',
            'help_text': help_text,
            'inline': 'inline' if inline_layout is True else None,
            'max_indent': max_indent,
            'uuid': uuid
        }

        with open('pl-order-blocks.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params)
        return html

    elif data['panel'] == 'submission':
        if pl.get_string_attrib(element, 'grading-method', 'ordered') == 'external':
            return ''  # external grader is responsible for displaying results screen

        student_submission = ''
        score = None
        feedback = None
        if answer_name in data['submitted_answers']:
            student_submission = [{
                'inner_html': attempt['inner_html'],
                'indent': ((attempt['indent'] or 0) * TAB_SIZE_PX) + INDENT_OFFSET
            } for attempt in data['submitted_answers'][answer_name]]

        if answer_name in data['partial_scores']:
            score = data['partial_scores'][answer_name]['score']
            feedback = data['partial_scores'][answer_name]['feedback']

        html_params = {
            'submission': True,
            'parse-error': data['format_errors'].get(answer_name, None),
            'student_submission': student_submission,
            'feedback': feedback
        }

        if score is not None:
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
        if grading_mode == 'unordered':
            grading_mode = 'in any order'
        elif grading_mode == 'dag' or grading_mode == 'ranking':
            grading_mode = 'one possible correct order'
        else:
            grading_mode = 'in the specified order'
        check_indentation = pl.get_boolean_attrib(element, 'indentation', INDENTION_DEFAULT)
        indentation_message = ', with correct indentation' if check_indentation is True else None

        if answer_name in data['correct_answers']:
            question_solution = [{
                'inner_html': solution['inner_html'],
                'indent': ((solution['indent'] or 0) * TAB_SIZE_PX) + INDENT_OFFSET
            } for solution in data['correct_answers'][answer_name]]

            html_params = {
                'true_answer': True,
                'question_solution': question_solution,
                'grading_mode': grading_mode,
                'indentation_message': indentation_message
            }
            with open('pl-order-blocks.mustache', 'r', encoding='utf-8') as f:
                html = chevron.render(f, html_params)
            return html
        else:
            return ''
    else:
        raise Exception('Invalid panel type')


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    answer_name = pl.get_string_attrib(element, 'answers-name')

    answer_raw_name = answer_name + '-input'
    student_answer = data['raw_submitted_answers'].get(answer_raw_name, '[]')

    student_answer = json.loads(student_answer)
    if student_answer is None or student_answer == []:
        data['format_errors'][answer_name] = 'No answer was submitted.'
        return

    grading_mode = pl.get_string_attrib(element, 'grading-method', GRADING_METHOD_DEFAULT)
    correct_answers = data['correct_answers'][answer_name]

    if grading_mode == 'ranking':
        for answer in student_answer:
            search = next((item for item in correct_answers if item['inner_html'] == answer['inner_html']), None)
            answer['ranking'] = search['ranking'] if search is not None else None
            answer['tag'] = search['tag'] if search is not None else None
    elif grading_mode == 'dag':
        for answer in student_answer:
            search = next((item for item in correct_answers if item['inner_html'] == answer['inner_html']), None)
            answer['tag'] = search['tag'] if search is not None else None

    if pl.get_string_attrib(element, 'grading-method', 'ordered') == 'external':
        for html_tags in element:
            if html_tags.tag == 'pl-answer':
                pl.check_attribs(html_tags, required_attribs=[], optional_attribs=[])
        file_name = pl.get_string_attrib(element, 'file-name', FILE_NAME_DEFAULT)

        answer_code = ''
        for index, answer in enumerate(student_answer):
            indent = int(answer['indent'] or 0)
            answer_code += ('    ' * indent) + lxml.html.fromstring(answer['inner_html']).text_content() + '\n'

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
    feedback_type = pl.get_string_attrib(element, 'feedback', FEEDBACK_DEFAULT)
    answer_weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)
    partial_credit_type = pl.get_string_attrib(element, 'partial-credit', 'lcs')

    true_answer_list = data['correct_answers'][answer_name]

    final_score = 0
    feedback = ''
    first_wrong = -1

    if len(student_answer) == 0:
        data['format_errors'][answer_name] = 'Your submitted answer was empty.'
        return

    if check_indentation:
        indentations = {ans['uuid']: ans['indent'] for ans in true_answer_list}
        for ans in student_answer:
            if ans['indent'] != indentations.get(ans['uuid']):
                if 'tag' in ans:
                    ans['tag'] = None
                else:
                    ans['inner_html'] = None

    if grading_mode == 'unordered':
        true_answer_list = filter_multiple_from_array(true_answer_list, ['uuid', 'indent', 'inner_html'])
        correct_selections = [opt for opt in student_answer if opt in true_answer_list]
        incorrect_selections = [opt for opt in student_answer if opt not in true_answer_list]
        final_score = float((len(correct_selections) - len(incorrect_selections)) / len(true_answer_list))
        final_score = max(0.0, final_score)  # scores cannot be below 0
    elif grading_mode == 'ordered':
        student_answer = [ans['inner_html'] for ans in student_answer]
        true_answer = [ans['inner_html'] for ans in true_answer_list]
        final_score = 1 if student_answer == true_answer else 0

    elif grading_mode in ['ranking', 'dag']:
        submission = [ans['tag'] for ans in student_answer]
        depends_graph = {}
        group_belonging = {}

        if grading_mode == 'ranking':
            true_answer_list = sorted(true_answer_list, key=lambda x: int(x['ranking']))
            true_answer = [answer['tag'] for answer in true_answer_list]
            tag_to_rank = {answer['tag']: answer['ranking'] for answer in true_answer_list}
            lines_of_rank = {rank: [tag for tag in tag_to_rank if tag_to_rank[tag] == rank] for rank in set(tag_to_rank.values())}

            cur_rank_depends = []
            prev_rank = None
            for tag in true_answer:
                ranking = tag_to_rank[tag]
                if prev_rank is not None and ranking != prev_rank:
                    cur_rank_depends = lines_of_rank[prev_rank]
                depends_graph[tag] = cur_rank_depends
                prev_rank = ranking

        elif grading_mode == 'dag':
            depends_graph = {ans['tag']: ans['depends'] for ans in true_answer_list}
            group_belonging = {ans['tag']: ans['group_info']['tag'] for ans in true_answer_list}
            group_depends = {ans['group_info']['tag']: ans['group_info']['depends'] for ans in true_answer_list if ans['group_info']['depends'] is not None}
            depends_graph.update(group_depends)

        num_initial_correct, true_answer_length = grade_dag(submission, depends_graph, group_belonging)
        first_wrong = -1 if num_initial_correct == len(submission) else num_initial_correct

        if partial_credit_type == 'none':
            if num_initial_correct == true_answer_length:
                final_score = 1
            elif num_initial_correct < true_answer_length:
                final_score = 0
        elif partial_credit_type == 'lcs':
            edit_distance = lcs_partial_credit(submission, depends_graph, group_belonging)
            final_score = max(0, float(true_answer_length - edit_distance) / true_answer_length)

        if final_score < 1:
            if feedback_type == 'none':
                feedback = ''
            elif feedback_type == 'first-wrong':
                if first_wrong == -1:
                    feedback = FIRST_WRONG_FEEDBACK['incomplete']
                else:
                    feedback = FIRST_WRONG_FEEDBACK['wrong-at-block'].format(str(first_wrong + 1))
                    has_block_groups = group_belonging != {} and set(group_belonging.values()) != {None}
                    if check_indentation:
                        feedback += FIRST_WRONG_FEEDBACK['indentation']
                    if has_block_groups:
                        feedback += FIRST_WRONG_FEEDBACK['block-group']
                    feedback += '</ul>'

    data['partial_scores'][answer_name] = {'score': round(final_score, 2), 'feedback': feedback, 'weight': answer_weight, 'first_wrong': first_wrong}


def test(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    grading_mode = pl.get_string_attrib(element, 'grading-method', 'ordered')
    answer_name = pl.get_string_attrib(element, 'answers-name')
    answer_name_field = answer_name + '-input'
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)
    feedback_type = pl.get_string_attrib(element, 'feedback', FEEDBACK_DEFAULT)
    partial_credit_type = pl.get_string_attrib(element, 'partial-credit', 'lcs')

    # Right now invalid input must mean an empty response. Because user input is only
    # through drag and drop, there is no other way for their to be invalid input. This
    # may change in the future if we have nested input boxes (like faded parsons' problems).
    if data['test_type'] == 'invalid':
        data['raw_submitted_answers'][answer_name_field] = json.dumps([])
        data['format_errors'][answer_name] = 'No answer was submitted.'

    # TODO grading modes 'unordered,' 'dag,' and 'ranking' allow multiple different possible
    # correct answers, we should check them at random instead of just the provided solution
    elif data['test_type'] == 'correct':
        answer = filter_multiple_from_array(data['correct_answers'][answer_name], ['inner_html', 'indent', 'uuid'])
        data['raw_submitted_answers'][answer_name_field] = json.dumps(answer)
        data['partial_scores'][answer_name] = {'score': 1, 'weight': weight, 'feedback': '', 'first_wrong': -1}

    # TODO: The only wrong answer being tested is the correct answer with the first
    # block mising. We should instead do a random selection of correct and incorrect blocks.
    elif data['test_type'] == 'incorrect':
        answer = filter_multiple_from_array(data['correct_answers'][answer_name], ['inner_html', 'indent', 'uuid'])
        answer.pop(0)
        score = 0
        if grading_mode == 'unordered' or (grading_mode in ['dag', 'ranking'] and partial_credit_type == 'lcs'):
            score = round(float(len(answer)) / (len(answer) + 1), 2)
        first_wrong = 0 if grading_mode in ['dag', 'ranking'] else -1

        if grading_mode == 'dag' and feedback_type == 'first-wrong':
            feedback = FIRST_WRONG_FEEDBACK['wrong-at-block'].format(1)
            group_belonging = {ans['tag']: ans['group_info']['tag'] for ans in data['correct_answers'][answer_name]}
            has_block_groups = group_belonging != {} and set(group_belonging.values()) != {None}
            if has_block_groups:
                feedback += FIRST_WRONG_FEEDBACK['block-group']
            feedback += '</ul>'
        else:
            feedback = ''

        data['raw_submitted_answers'][answer_name_field] = json.dumps(answer)
        data['partial_scores'][answer_name] = {'score': score, 'weight': weight, 'feedback': feedback, 'first_wrong': first_wrong}

    else:
        raise Exception('invalid result: %s' % data['test_type'])
