#!/usr/bin/env python3

import argparse
import json
import os
import re
import sys
import uuid
from collections import OrderedDict
from os import path

import canvas


def file_name_only(name):
    return re.sub('[\W_]+', '', name)

parser = argparse.ArgumentParser()
canvas.Canvas.add_arguments(parser, quiz=True)
parser.add_argument("pl_repo",
                    help="Directory where PrairieLearn repo is stored")
parser.add_argument("pl_course_instance",
                    help="Course instance where assessment will be created")
parser.add_argument("-t", "--assessment-type", default=None,
                    help="Assessment type to assign this assessment to")
parser.add_argument("-s", "--assessment-set", default="Quiz",
                    help="Assessment set to assign this assessment to")
parser.add_argument("-n", "--assessment-number", default="",
                    help="Assessment set to assign this assessment to")
parser.add_argument("--topic", default="None",
                    help="Assessment set to assign this assessment to")
args = parser.parse_args()
canvas = canvas.Canvas(args=args)

if not os.path.exists(os.path.join(args.pl_repo, 'infoCourse.json')):
    raise Exception("Provided directory is not a PrairieLearn repository")

print('Reading data from Canvas...')
course = canvas.course(args.course, prompt_if_needed=True)
print('Using course: %s / %s' % (course['term']['name'],
                                 course['course_code']))

quiz = course.quiz(args.quiz, prompt_if_needed=True)
print('Using quiz: %s' % (quiz['title']))

# Reading questions
print('Retrieving quiz questions from Canvas...')
(questions, groups) = quiz.questions()

questions_dir = os.path.join(args.pl_repo, 'questions', file_name_only(quiz['title']))
if not os.path.isdir(questions_dir):
    os.makedirs(questions_dir)
assessments_dir = os.path.join(args.pl_repo, 'courseInstances', args.pl_course_instance, 'assessments')
if not os.path.isdir(assessments_dir):
    os.makedirs(assessments_dir)

quiz_name = os.path.join(assessments_dir, file_name_only(quiz['title']))
if os.path.exists(quiz_name):
    suffix = 1
    while os.path.exists(f'{quiz_name}_{suffix}'):
        suffix += 1
    quiz_name = f'{quiz_name}_{suffix}'
os.makedirs(quiz_name)

pl_quiz = {
    'uuid': str(uuid.uuid4()),
    'type': args.assessment_type if args.assessment_type else 'Exam' if quiz['time_limit'] else 'Homework',
    'title': quiz['title'],
    'text': quiz['description'],
    'set': args.assessment_set,
    'number': args.assessment_number,
    'allowAccess': [{
        'startDate': quiz['unlock_at'],
        'credit': 100
    }],
    'zones': [{
        'questions': []
    }],
    'comment': f'Imported from Canvas, quiz {quiz["id"]}'
}

if (quiz['access_code']):
    pl_quiz['allowAccess'][0]['password'] = quiz['access_code']
if (quiz['lock_at']):
    pl_quiz['allowAccess'][0]['endDate'] = quiz['lock_at']
if (quiz['time_limit']):
    pl_quiz['allowAccess'][0]['timeLimitMin'] = quiz['time_limit']

for question in questions.values():
    # Clear the screen
    if os.name == 'nt': os.system('cls')
    else: print('\033c', end="")

    print(f'Handling question {question["id"]}...')
    print(question['question_text'])
    print()
    for answer in question.get('answers', []):
        print(f" - {answer['text']}")
    question_title = input('\nQuestion title (or blank to skip): ')
    if not question_title: continue
    question_name = file_name_only(question_title)
    suffix = 0
    while os.path.exists(os.path.join(questions_dir, question_name)):
        suffix += 1
        question_name = f'{file_name_only(question_title)}_{suffix}'
    question_dir = os.path.join(questions_dir, question_name)
    os.makedirs(question_dir)

    question_alt = {
        'id': file_name_only(quiz['title']) + '/' + question_name,
        'points': question['points_possible']
    }

    if question['quiz_group_id']:
        group = groups[question['quiz_group_id']]
        if '_pl_alt' not in group:
            group['_pl_alt'] = {
                'numberChoose': group['pick_count'],
                'points': group['question_points'],
                'alternatives': []
            }
            pl_quiz['zones'][0]['questions'].append(group['_pl_alt'])
        group['_pl_alt']['alternatives'].append(question_alt)
    else:
        pl_quiz['zones'][0]['questions'].append(question_alt)

    with open(os.path.join(question_dir, 'info.json'), 'w') as info:
        obj = {
            'uuid': str(uuid.uuid4()),
            'type': 'v3',
            'title': question_title,
            'topic': args.topic,
            'tags': ['fromcanvas']
        }
        if question['question_type'] == 'text_only_question' or \
           question['question_type'] == 'essay_question':
            obj['gradingMethod'] = 'Manual'
        json.dump(obj, info, indent=4)

    with open(os.path.join(question_dir, 'question.html'), 'w') as template:
        if question['question_type'] == 'calculated_question':
            for variable in question['variables']:
                question['question_text'] = question['question_text'].replace(f'[{variable["name"]}]', '{{params.' + variable["name"] + '}}')

        if question['question_type'] != 'fill_in_multiple_blanks_question' and question['question_type'] != 'multiple_dropdowns_question':
            template.write('<pl-question-panel>\n<p>\n')
            template.write(question['question_text'] + '\n')
            template.write('</p>\n</pl-question-panel>\n')

        if question['question_type'] == 'text_only_question':
            pass

        elif question['question_type'] == 'essay_question':
            template.write('<pl-rich-text-editor file-name="answer.html"></pl-rich-text-editor>\n')

        elif question['question_type'] == 'multiple_answers_question':
            template.write('<pl-checkbox answers-name="checkbox">\n')
            for answer in question['answers']:
                if answer['weight']:
                    template.write('  <pl-answer correct="true">')
                else:
                    template.write('  <pl-answer>')
                template.write(answer['text'] + '</pl-answer>\n')
            template.write('</pl-checkbox>\n')

        elif question['question_type'] == 'true_false_question' or question['question_type'] == 'multiple_choice_question':
            template.write('<pl-multiple-choice answers-name="mc">\n')
            for answer in question['answers']:
                if answer['weight']:
                    template.write('  <pl-answer correct="true">')
                else:
                    template.write('  <pl-answer>')
                template.write(answer['text'] + '</pl-answer>\n')
            template.write('</pl-multiple-choice>\n')

        elif question['question_type'] == 'numerical_question':
            answer = question['answers'][0]
            if answer['numerical_answer_type'] == 'exact_answer' and abs(answer['exact'] - int(answer['exact'])) < 0.001 and answer['margin'] == 0:
                template.write(f'<pl-integer-input answers-name="value" correct-answer="{int(answer["exact"])}"></pl-integer-input>\n')
            elif answer['numerical_answer_type'] == 'exact_answer':
                template.write(f'<pl-number-input answers-name="value" correct-answer="{answer["exact"]}" atol="{answer["margin"]}"></pl-number-input>\n')
            elif answer['numerical_answer_type'] == 'range_answer':
                average = (answer["end"] + answer["start"]) / 2
                margin = abs(answer["end"] - average)
                template.write(f'<pl-number-input answers-name="value" correct-answer="{average}" atol="{margin}"></pl-number-input>\n')
            elif answer['numerical_answer_type'] == 'precision_answer':
                template.write(f'<pl-number-input answers-name="value" correct-answer="{answer["approximate"]}" comparison="sigfig" digits="{answer["precision"]}"></pl-number-input>\n')
            else:
                input(f'Invalid numerical answer type: {answer["numerical_answer_type"]}')
                template.write(f'<pl-number-input answers-name="value"></pl-number-input>\n')

        elif question['question_type'] == 'calculated_question':
            answers_name = question['formulas'][-1]['formula'].split('=')[0].strip()
            template.write(f'<pl-number-input answers-name="{answers_name}" comparison="decdig" digits="{question["formula_decimal_places"]}"></pl-number-input>\n')

        elif question['question_type'] == 'short_answer_question':
            answer = question['answers'][0]
            template.write(f'<pl-string-input answers-name="input" correct-answer="{answer["text"]}"></pl-string-input>\n')

        elif question['question_type'] == 'fill_in_multiple_blanks_question':
            question_text = question['question_text']
            options = {}
            for answer in question['answers']:
                if answer['blank_id'] not in options:
                    options[answer['blank_id']] = []
                options[answer['blank_id']].append(answer)
            for answer_id, answers in options.items():
                question_text.replace(f'[{answer_id}]', f'<pl-string-input answers-name="{answer_id}" correct-answer="{answers[0]["text"]}" remove-spaces="true" ignore-case="true" display="inline"></pl-string-input>')
            template.write(question_text + '\n')

        elif question['question_type'] == 'matching_question':
            template.write('<pl-matching answers-name="match">\n')
            for answer in question['answers']:
                template.write(f'  <pl-statement match="m{answer["match_id"]}">{answer["text"]}</pl-statement>\n');
            for match in question['matches']:
                template.write(f'  <pl-option name="m{match["match_id"]}">{match["text"]}</pl-option>\n');
            template.write('</pl-matching>\n')

        elif question['question_type'] == 'multiple_dropdowns_question':
            blanks = {}
            for answer in question['answers']:
                if answer['blank_id'] not in blanks:
                    blanks[answer['blank_id']] = []
                blanks[answer['blank_id']].append(answer)
            question_text = question['question_text']
            for blank, answers in blanks.items():
                dropdown = f'<pl-multiple-choice display="dropdown" hide-letter-keys="true" answers-name="{blank}">\n'
                for answer in answers:
                    dropdown += '  <pl-answer'
                    if answer['weight'] > 0: dropdown += ' correct="true"'
                    dropdown += f'>{answer["text"]}</pl-answer>\n'
                dropdown += '</pl-multiple-choice>'
                question_text = question_text.replace(f'[{blank}]', dropdown)
            template.write(question_text + '\n')

        else:
            input('Unsupported question type: ' + question['question_type'])
            template.write(json.dumps(question, indent=4))

        if question['correct_comments'] or question['neutral_comments']:
            template.write('<pl-answer-panel>\n<p>\n')
            if question.get('correct_comments_html', False):
                template.write(question['correct_comments_html'] + '\n')
            elif question['correct_comments']:
                template.write(question['correct_comments'] + '\n')
            if question.get('neutral_comments_html', False):
                template.write(question['neutral_comments_html'] + '\n')
            elif question['neutral_comments']:
                template.write(question['neutral_comments'] + '\n')
            template.write('</p>\n</pl-answer-panel>\n')

    if question['question_type'] == 'calculated_question':
        with open(os.path.join(question_dir, 'server.py'), 'w') as script:
            script.write('import random\n\n')
            script.write('def generate(data):\n')
            for variable in question['variables']:
                if not variable.get('scale', False):
                    script.write(f'    {variable["name"]} = random.randint({int(variable["min"])}, {int(variable["max"])})\n')
                else:
                    multip = 10 ** variable["scale"]
                    script.write(f'    {variable["name"]} = random.randint({int(variable["min"] * multip)}, {int(variable["max"] * multip)}) / {multip}\n')
            for formula in question['formulas']:
                script.write(f'    {formula["formula"]}\n')
            for variable in question['variables']:
                script.write(f'    data["params"]["{variable["name"]}"] = {variable["name"]}\n')
            answer = question["formulas"][-1]['formula'].split('=')[0].strip()
            script.write(f'    data["correct_answers"]["{answer}"] = {answer}\n')

with open(os.path.join(quiz_name, 'infoAssessment.json'), 'w') as assessment:
    json.dump(pl_quiz, assessment, indent=4)

print(f'\nDONE. The assessment was created in: {quiz_name}')
