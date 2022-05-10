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

def grade(answer_name, data, tag_to_boxes):
    # element = lxml.html.fragment_fromstring(element_html)
    # answer_name = pl.get_string_attrib(element, 'answers-name')

    student_answer = data['submitted_answers'][answer_name]
    grading_mode = 'dag' # pl.get_string_attrib(element, 'grading-method', GRADING_METHOD_DEFAULT)
    check_indentation = False # pl.get_boolean_attrib(element, 'indentation', INDENTION_DEFAULT)
    feedback_type = "first-wrong" #pl.get_string_attrib(element, 'feedback', FEEDBACK_DEFAULT)
    answer_weight = 1 #pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)
    partial_credit_type = 'lcs' #pl.get_string_attrib(element, 'partial-credit', 'lcs')

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

    # CHECK THE SYMBOLIC INPUT BOXES
    for ans in student_answer:
        if ans['tag'] in tag_to_boxes:
            if not all([data['partial_scores'][name]['score'] == 1 for name in tag_to_boxes[ans['tag']]]):
                ans['tag'] = None
    ################################

    # print(data['partial_scores'])

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
                    feedback += "<li>You incorrectly filled out an input box within the block</li>"
                    feedback += '</ul>'

    data['partial_scores'][answer_name] = {'score': round(final_score, 2), 'feedback': feedback, 'weight': answer_weight, 'first_wrong': first_wrong}

