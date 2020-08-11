import prairielearn as pl
import lxml.html
import random
import chevron

# Read https://prairielearn.readthedocs.io/en/latest/devElements/
# Official documentation on making custom PL

def render_html_colour(score):
    # used to render the correct colour depending on student score
    if score == 0:
        return 'badge-danger'
    elif score == 1.0:
        return 'badge-success'
    else:
        return 'badge-warning'


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    answerName = pl.get_string_attrib(element, 'answers-name')

    if data['panel'] == 'question':
        # I PROMISE I WILL FIX THIS WHEN I FIGURE OUT HOW TO USE MUSTACHE 
        mcq_options = []   # stores MCQ options
        question_instruction_blocks = []   # stores question instructions within the table
        html_string = ''
        pl_drag_drop_element = lxml.html.fragment_fromstring(element_html)

        for html_tags in pl_drag_drop_element:
            if html_tags.tag == 'pl-answer':
                pl.check_attribs(html_tags, required_attribs=['correct'], optional_attribs=['ranking', 'indent'])
                mcq_options.append(str.strip(html_tags.text))   # store the original specified ordering of all the MCQ options
            if html_tags.tag == 'pl-info':
                question_instruction_blocks.append(str.strip(html_tags.text))

        answerName = pl.get_string_attrib(pl_drag_drop_element, 'answers-name')

        html_string = '<div class="row"><div class="column"><ul ' + f'id="{str(answerName) + str("-options")}" name="{str(answerName)}"' + 'class="connectedSortable" >'

        # check whether we need to shuffle the MCQ options
        pl.check_attribs(pl_drag_drop_element, required_attribs=['answers-name'], optional_attribs=['shuffle-options', 'permutation-mode'])
        isShuffle = pl.get_string_attrib(pl_drag_drop_element, 'shuffle-options', False) # default to FALSE, no shuffling unless otherwise specified
        if isShuffle == 'true':
            # concat the two arrays so we can shuffle all the options
            random.shuffle(mcq_options)
        html_string += "<li class='ui-sortable-handle info info-fixed'>Choose from these option:</li>"
        student_previous_submission = []
        if answerName in data['submitted_answers']:
            student_previous_submission = data['submitted_answers'][answerName]['student_raw_submission']
            # the student has previously submitted something
            # we render the MCQ options the student DID NOT drag in the
            # MCQ options column
            mcq_options = list(set(mcq_options) - set(student_previous_submission))

        for mcq_options_text in mcq_options:
            # render options column
            html_string += f'<li>{mcq_options_text}</li>'

        html_string += f'</ul></div><div class="column"><ul id="{str(answerName) + str("-dropzone")}" name="{str(answerName)}" class="connectedSortable dropzone"><li class="ui-sortable-handle info info-fixed">Drag your answers below:</li>'

        for instruction_text in question_instruction_blocks:
            # render the question instruction bullet points
            html_string += f"<li class='ui-sortable-handle info info-fixed code'>{instruction_text}</li>"

        for index, mcq_options_text in enumerate(student_previous_submission):
            # render the answers column (restore the student submission)
            submission_indent = data['submitted_answers'][answerName]['student_answer_indent'][index]
            submission_indent = (int(submission_indent) * 50) + 5
            html_string += f"<li style='margin-left: {submission_indent}px;'>{mcq_options_text}</li>"
        html_string += '</ul></div></div>'

        answerName = pl.get_string_attrib(pl_drag_drop_element, 'answers-name')
        html_string += f'<input id="{str(answerName) + str("-input") }" type="hidden" name="{str(answerName) + str("-input") }" value=""/>'
        # html_string += f'{data}'
        return html_string

    elif data['panel'] == 'submission':
        # render the submission panel
        uuid = pl.get_uuid()
        student_submission = ''
        colour = 'badge-danger'
        score = 0
        feedback = None

        if answerName in data['submitted_answers']:
            student_submission = data['submitted_answers'][answerName]['student_raw_submission']
        if answerName in data['partial_scores']:
            colour = render_html_colour(data['partial_scores'][answerName]['score'])
            score = data['partial_scores'][answerName]['score'] * 100
            feedback = data['partial_scores'][answerName]['feedback']

        html_params = {
            'submission': True,
            'uuid': uuid,
            'parse-error': data['format_errors'].get(answerName, None),
            'student_submission': student_submission,
            'colour': colour,
            'score': score,
            'perfect_score': True if score == 100 else None,
            'feedback': feedback
            # 'data': data
        }

        # Finally, render the HTML
        with open('pl-drag-drop-element.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
        return html

    elif data['panel'] == 'answer':
        permutationMode = pl.get_string_attrib(element, 'permutation-mode')
        permutationMode = ' in any order' if permutationMode == 'any' else 'in the specified order'
        
        if answerName in data['correct_answers']:
            html_params = {
                'true_answer': True,
                'question_solution': str(data['correct_answers'][answerName]['correct_answers']),
                'permutationMode': permutationMode
            }
            with open('pl-drag-drop-element.mustache', 'r', encoding='utf-8') as f:
                html = chevron.render(f, html_params).strip()
            return html
        else:
            return ''


def prepare(element_html, data):
    pl_drag_drop_element = lxml.html.fragment_fromstring(element_html)
    answerName = pl.get_string_attrib(pl_drag_drop_element, 'answers-name')

    correct_answers = []
    correct_answers_indent = []
    
    for html_tags in pl_drag_drop_element:
        if html_tags.tag == 'pl-answer':
            isCorrect = pl.get_string_attrib(html_tags, 'correct')
            answerIndent = pl.get_string_attrib(html_tags, 'indent', '-1') # get answer indent, and default to -1 (indent level ignored)
            if isCorrect.lower() == 'true':
                # add option to the correct answer array, along with the correct required indent
                correct_answers.append(str.strip(html_tags.text))
                correct_answers_indent.append(answerIndent)
    
    data['correct_answers'][answerName] = {'correct_answers': correct_answers,
                                           'correct_answers_indent': correct_answers_indent}


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    answerName = pl.get_string_attrib(element, 'answers-name')

    temp = answerName
    temp += '-input'  # this is how the backend is written

    student_answer_temp = ''
    if temp in data['raw_submitted_answers']:
        student_answer_temp = data['raw_submitted_answers'][temp]

    if student_answer_temp is None:
        data['format_errors'][answerName] = 'NULL was submitted as an answer!'
        return
    elif student_answer_temp == '':
        data['format_errors'][answerName] = 'No answer was submitted.'
        return

    student_answer_temp = list(student_answer_temp.split(','))

    student_answer = []
    student_answer_indent = []
    permutationMode = pl.get_string_attrib(element, 'permutation-mode')

    student_answer_ranking = ['Question permutationMode is not "ranking"']
    for answer in student_answer_temp:
        # student answers are formatted as: {answerString}:::{indent}, we split the answer
        answer = answer.split(':::')
        if len(answer) == 1:
            # because we already caught empty string submission above
            # failing to split the answer implies an error
            data['format_errors'][answerName] = 'Failed to parse submission: formatting is invalid! This should not happen, contact instructor for help.'
            return

        if not str.isdigit(answer[1]) or int(answer[1]) not in list(range(0, 5)):  # indent is a number in [0, 4]
            data['format_errors'][answerName] = f'Indent level {answer[1]} is invalid! Indention level must be a number between 0 or 4 inclusive.'
            return

        student_answer.append(answer[0])
        student_answer_indent.append(answer[1])
    del student_answer_temp
    if permutationMode.lower() == 'ranking':
        student_answer_ranking = []
        pl_drag_drop_element = lxml.html.fragment_fromstring(element_html)
        for answer in student_answer:
            e = pl_drag_drop_element.xpath(f'.//pl-answer[text()="{answer}"]')
            try:
                ranking = e[0].attrib['ranking']
            except IndexError:
                ranking = 0
            except KeyError:
                ranking = -1   # wrong answers have no ranking
            student_answer_ranking.append(ranking)
    data['submitted_answers'][answerName] = {'student_submission_ordering': student_answer_ranking,
                                             'student_raw_submission': student_answer,
                                             'student_answer_indent': student_answer_indent}
    if temp in data['submitted_answers']:
        del data['submitted_answers'][temp]


def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    answerName = pl.get_string_attrib(element, 'answers-name')

    student_answer = data['submitted_answers'][answerName]['student_raw_submission']
    student_answer_indent = data['submitted_answers'][answerName]['student_answer_indent']
    permutationMode = pl.get_string_attrib(element, 'permutation-mode')
    true_answer = data['correct_answers'][answerName]['correct_answers']
    true_answer_indent = data['correct_answers'][answerName]['correct_answers_indent']

    final_score = 0
    feedback = ''

    if permutationMode == 'any':
        intersection = list(set(student_answer) & set(true_answer))
        final_score = float(len(intersection) / len(true_answer))
    elif permutationMode == 'html-order':
        final_score = 1.0 if student_answer == true_answer else 0.0
    elif permutationMode == 'ranking':
        ranking = data['submitted_answers'][answerName]['student_submission_ordering']
        correctness = 1
        partial_credit = 0
        if len(ranking) != 0 and len(ranking) == len(true_answer):
            if ranking[0] == 1:
                partial_credit = 1  # student will at least get 1 point for getting first element correct
            for x in range(0, len(ranking) - 1):
                if int(ranking[x]) == -1:
                    correctness = 0
                    break
                if int(ranking[x]) <= int(ranking[x + 1]):
                    correctness += 1
                else:
                    correctness = 0
                    break
        else:
            correctness = 0
        correctness = max(correctness, partial_credit)
        final_score = float(correctness / len(true_answer))

    # apply penalty if student got indent wrong AND indent matters
    if student_answer_indent != true_answer_indent and true_answer_indent.count('-1') != len(true_answer_indent):
        final_score = final_score * 0.5
    data['partial_scores'][answerName] = {'score': final_score, 'feedback': feedback}


def test(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    answerName = pl.get_string_attrib(element, 'answers-name')
    answerNameField = answerName + '-input'

    # # incorrect and correct answer test cases
    # # this creates the EXPECTED SUBMISSION field for test cases
    if data['test_type'] == 'correct':
        temp = data['correct_answers'][answerName]  # temp array to hold the correct answers
        temp = list(map(lambda x: x + ':::0', temp))
        data['raw_submitted_answers'][answerNameField] = ','.join(temp)
        data['partial_scores'][answerName] = {'score': 1, 'feedback': ''}
    elif data['test_type'] == 'incorrect':
        temp = data['correct_answers'][answerName]  # temp array to hold the correct answers
        incorrect_answers = []
        for html_tags in element:
            if html_tags.tag == 'pl-answer':
                incorrect_answers.append(str.strip(html_tags.text))
        incorrect_answers = list(filter(lambda x: x not in temp, incorrect_answers))
        incorrect_answers = list(map(lambda x: x + ':::0', incorrect_answers))

        data['raw_submitted_answers'][answerNameField] = ','.join(incorrect_answers)
        data['partial_scores'][answerName] = {'score': 0, 'feedback': ''}

    elif data['test_type'] == 'invalid':
        data['raw_submitted_answers'][answerName] = 'bad input'
        data['format_errors'][answerName] = 'format error message'
    else:
        raise Exception('invalid result: %s' % data['test_type'])

