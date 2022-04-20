import prairielearn as pl
import pathlib
import json
import lxml.html
import random
import math
import chevron

WEIGHT_DEFAULT = 1
FIXED_ORDER_DEFAULT = False
INLINE_DEFAULT = False
NONE_OF_THE_ABOVE_DEFAULT = False
ALL_OF_THE_ABOVE_DEFAULT = False
EXTERNAL_JSON_DEFAULT = None
HIDE_LETTER_KEYS_DEFAULT = False
EXTERNAL_JSON_CORRECT_KEY_DEFAULT = 'correct'
EXTERNAL_JSON_INCORRECT_KEY_DEFAULT = 'incorrect'
FEEDBACK_DEFAULT = None


def categorize_options(element, data):
    """Get provided correct and incorrect answers"""
    correct_answers = []
    incorrect_answers = []
    index = 0
    for child in element:
        if child.tag in ['pl-answer', 'pl_answer']:
            pl.check_attribs(child, required_attribs=[], optional_attribs=['correct', 'feedback'])
            correct = pl.get_boolean_attrib(child, 'correct', False)
            child_html = pl.inner_html(child)
            child_feedback = pl.get_string_attrib(child, 'feedback', FEEDBACK_DEFAULT)
            answer_tuple = (index, correct, child_html, child_feedback)
            if correct:
                correct_answers.append(answer_tuple)
            else:
                incorrect_answers.append(answer_tuple)
            index += 1

    file_path = pl.get_string_attrib(element, 'external-json', EXTERNAL_JSON_DEFAULT)
    if file_path is not EXTERNAL_JSON_DEFAULT:
        correct_attrib = pl.get_string_attrib(element, 'external-json-correct-key', EXTERNAL_JSON_CORRECT_KEY_DEFAULT)
        incorrect_attrib = pl.get_string_attrib(element, 'external-json-incorrect-key', EXTERNAL_JSON_INCORRECT_KEY_DEFAULT)
        if pathlib.PurePath(file_path).is_absolute():
            json_file = file_path
        else:
            json_file = pathlib.PurePath(data['options']['question_path']).joinpath(file_path)
        try:
            with open(json_file, mode='r', encoding='utf-8') as f:
                obj = json.load(f)
                for text in obj.get(correct_attrib, []):
                    correct_answers.append((index, True, text, None))
                    index += 1
                for text in obj.get(incorrect_attrib, []):
                    incorrect_answers.append((index, False, text, None))
                    index += 1
        except FileNotFoundError:
            raise Exception(f'JSON answer file: "{json_file}" could not be found')
    return correct_answers, incorrect_answers


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers-name']
    optional_attribs = ['weight', 'number-answers', 'fixed-order', 'inline', 'hide-letter-keys',
                        'none-of-the-above', 'none-of-the-above-feedback', 'all-of-the-above', 'all-of-the-above-feedback',
                        'external-json', 'external-json-correct-key', 'external-json-incorrect-key']
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, 'answers-name')

    correct_answers, incorrect_answers = categorize_options(element, data)

    len_correct = len(correct_answers)
    len_incorrect = len(incorrect_answers)
    len_total = len_correct + len_incorrect

    enable_nota = pl.get_boolean_attrib(element, 'none-of-the-above', NONE_OF_THE_ABOVE_DEFAULT)
    enable_aota = pl.get_boolean_attrib(element, 'all-of-the-above', ALL_OF_THE_ABOVE_DEFAULT)

    nota_correct = False
    aota_correct = False
    if enable_nota or enable_aota:
        prob_space = len_correct + enable_nota + enable_aota
        rand_int = random.randint(1, prob_space)
        # Either 'None of the above' or 'All of the above' is correct
        # with probability 1/(number_correct + enable-nota + enable-aota).
        # However, if len_correct is 0, nota_correct is guaranteed to be True.
        # Thus, if no correct option is provided, 'None of the above' will always
        # be correct, and 'All of the above' always incorrect
        nota_correct = enable_nota and (rand_int == 1 or len_correct == 0)
        # 'All of the above' will always be correct when no incorrect option is
        # provided, while still never both True
        aota_correct = enable_aota and (rand_int == 2 or len_incorrect == 0) and not nota_correct

    if len_correct < 1 and not enable_nota:
        # This means the code needs to handle the special case when len_correct == 0
        raise Exception('pl-multiple-choice element must have at least 1 correct answer or set none-of-the-above')

    if enable_aota and len_correct < 2:
        # To prevent confusion on the client side
        raise Exception('pl-multiple-choice element must have at least 2 correct answers when all-of-the-above is set')

    # 1. Pick the choice(s) to display
    number_answers = pl.get_integer_attrib(element, 'number-answers', None)
    # determine if user provides number-answers
    set_num_answers = True
    if number_answers is None:
        set_num_answers = False
        number_answers = len_total + enable_nota + enable_aota
    # figure out how many choice(s) to choose from the *provided* choices,
    # excluding 'none-of-the-above' and 'all-of-the-above'
    number_answers -= (enable_nota + enable_aota)

    expected_num_answers = number_answers

    if enable_aota:
        # min number if 'All of the above' is correct
        number_answers = min(len_correct, number_answers)
        # raise exception when the *provided* number-answers can't be satisfied
        if set_num_answers and number_answers < expected_num_answers:
            raise Exception(f'Not enough correct choices for all-of-the-above. Need {expected_num_answers - number_answers} more')
    if enable_nota:
        # if nota correct
        number_answers = min(len_incorrect, number_answers)
        # raise exception when the *provided* number-answers can't be satisfied
        if set_num_answers and number_answers < expected_num_answers:
            raise Exception(f'Not enough incorrect choices for none-of-the-above. Need {expected_num_answers - number_answers} more')
    # this is the case for
    # - 'All of the above' is incorrect
    # - 'None of the above' is incorrect
    # - nota and aota disabled
    number_answers = min(min(1, len_correct) + len_incorrect, number_answers)

    if aota_correct:
        # when 'All of the above' is correct, we choose all from correct
        # and none from incorrect
        number_correct = number_answers
        number_incorrect = 0
    elif nota_correct:
        # when 'None of the above' is correct, we choose all from incorrect
        # and none from correct
        number_correct = 0
        number_incorrect = number_answers
    else:
        # PROOF: by the above probability, if len_correct == 0, then nota_correct
        # conversely; if not nota_correct, then len_correct != 0. Since len_correct
        # is none negative, this means len_correct >= 1.
        number_correct = 1
        number_incorrect = max(0, number_answers - number_correct)

    if not (0 <= number_incorrect <= len_incorrect):
        raise Exception('INTERNAL ERROR: number_incorrect: (%d, %d, %d)' % (number_incorrect, len_incorrect, number_answers))

    # 2. Sample correct and incorrect choices
    sampled_correct = random.sample(correct_answers, number_correct)
    sampled_incorrect = random.sample(incorrect_answers, number_incorrect)

    sampled_answers = sampled_correct + sampled_incorrect
    random.shuffle(sampled_answers)

    # 3. Modify sampled choices
    fixed_order = pl.get_boolean_attrib(element, 'fixed-order', FIXED_ORDER_DEFAULT)
    if fixed_order:
        # we can't simply skip the shuffle because we already broke the original
        # order by separating into correct/incorrect lists
        sampled_answers.sort(key=lambda a: a[0])  # sort by stored original index

    inline = pl.get_boolean_attrib(element, 'inline', INLINE_DEFAULT)
    if enable_aota:
        if inline:
            aota_text = 'All of these'
        else:
            aota_text = 'All of the above'
        # Add 'All of the above' option after shuffling
        aota_feedback = pl.get_string_attrib(element, 'all-of-the-above-feedback', FEEDBACK_DEFAULT)
        sampled_answers.append((len_total, aota_correct, aota_text, aota_feedback))

    if enable_nota:
        if inline:
            nota_text = 'None of these'
        else:
            nota_text = 'None of the above'
        # Add 'None of the above' option after shuffling
        nota_feedback = pl.get_string_attrib(element, 'none-of-the-above-feedback', FEEDBACK_DEFAULT)
        sampled_answers.append((len_total + 1, nota_correct, nota_text, nota_feedback))

    # 4. Write to data
    # Because 'All of the above' is below all the correct choice(s) when it's
    # true, the variable correct_answer will save it as correct, and
    # overwriting previous choice(s)
    display_answers = []
    correct_answer = None
    for (i, (index, correct, html, feedback)) in enumerate(sampled_answers):
        keyed_answer = {'key': pl.index2key(i), 'html': html, 'feedback': feedback}
        display_answers.append(keyed_answer)
        if correct:
            correct_answer = keyed_answer

    if name in data['params']:
        raise Exception('duplicate params variable name: %s' % name)
    if name in data['correct_answers']:
        raise Exception('duplicate correct_answers variable name: %s' % name)
    data['params'][name] = display_answers
    data['correct_answers'][name] = correct_answer


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')

    answers = data['params'].get(name, [])
    inline = pl.get_boolean_attrib(element, 'inline', INLINE_DEFAULT)

    submitted_key = data['submitted_answers'].get(name, None)
    correct_key = data['correct_answers'].get(name, {'key': None}).get('key', None)

    if data['panel'] == 'question':
        editable = data['editable']
        partial_score = data['partial_scores'].get(name, {'score': None})
        score = partial_score.get('score', None)
        display_score = (score is not None)
        feedback = partial_score.get('feedback', None)

        # Set up the templating for each answer
        answerset = []
        for answer in answers:
            answer_html = {
                'key': answer['key'],
                'checked': (submitted_key == answer['key']),
                'html': answer['html'],
                'display_score_badge': display_score and submitted_key == answer['key'],
                'display_feedback': submitted_key == answer['key'] and feedback,
                'feedback': feedback
            }
            if answer_html['display_score_badge']:
                answer_html['correct'] = (correct_key == answer['key'])
                answer_html['incorrect'] = (correct_key != answer['key'])
            answerset.append(answer_html)

        html_params = {
            'question': True,
            'inline': inline,
            'name': name,
            'editable': editable,
            'display_score_badge': display_score,
            'answers': answerset,
            'hide_letter_keys': pl.get_boolean_attrib(element, 'hide-letter-keys', HIDE_LETTER_KEYS_DEFAULT)
        }

        # Display the score badge if necessary
        if display_score:
            try:
                score = float(score)
                if score >= 1:
                    html_params['correct'] = True
                elif score > 0:
                    html_params['partial'] = math.floor(score * 100)
                else:
                    html_params['incorrect'] = True
            except Exception:
                raise ValueError('invalid score' + score)

        with open('pl-multiple-choice.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    elif data['panel'] == 'submission':
        parse_error = data['format_errors'].get(name, None)
        html_params = {
            'submission': True,
            'parse_error': parse_error,
            'uuid': pl.get_uuid(),
            'hide_letter_keys': pl.get_boolean_attrib(element, 'hide-letter-keys', HIDE_LETTER_KEYS_DEFAULT)
        }

        if parse_error is None:
            submitted_answer = next(filter(lambda a: a['key'] == submitted_key, answers), None)
            html_params['key'] = submitted_key
            html_params['answer'] = submitted_answer

            partial_score = data['partial_scores'].get(name, {'score': None})
            feedback = partial_score.get('feedback', None)
            score = partial_score.get('score', None)
            if score is not None:
                html_params['display_score_badge'] = True
                try:
                    score = float(score)
                    if score >= 1:
                        html_params['correct'] = True
                    elif score > 0:
                        html_params['partial'] = math.floor(score * 100)
                    else:
                        html_params['incorrect'] = True
                except Exception:
                    raise ValueError('invalid score' + score)
            html_params['display_feedback'] = bool(feedback)
            html_params['feedback'] = feedback

        with open('pl-multiple-choice.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    elif data['panel'] == 'answer':
        correct_answer = data['correct_answers'].get(name, None)

        if correct_answer is None:
            raise ValueError('No true answer.')
        else:
            html_params = {
                'answer': True,
                'answers': correct_answer,
                'key': correct_answer['key'],
                'html': correct_answer['html'],
                'inline': inline,
                'hide_letter_keys': pl.get_boolean_attrib(element, 'hide-letter-keys', HIDE_LETTER_KEYS_DEFAULT)
            }
            with open('pl-multiple-choice.mustache', 'r', encoding='utf-8') as f:
                html = chevron.render(f, html_params).strip()
    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')

    submitted_key = data['submitted_answers'].get(name, None)
    all_keys = [a['key'] for a in data['params'][name]]

    if submitted_key is None:
        data['format_errors'][name] = 'No answer was submitted.'
        return

    if submitted_key not in all_keys:
        data['format_errors'][name] = f'Invalid choice: {pl.escape_invalid_string(submitted_key)}'
        return


def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)

    submitted_key = data['submitted_answers'].get(name, None)
    correct_key = data['correct_answers'].get(name, {'key': None}).get('key', None)

    score = 0
    if (submitted_key is not None and submitted_key == correct_key):
        score = 1

    feedback = None
    for option in data['params'][name]:
        if option['key'] == submitted_key:
            feedback = option.get('feedback', None)

    data['partial_scores'][name] = {'score': score, 'weight': weight, 'feedback': feedback}


def test(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)

    correct_key = data['correct_answers'].get(name, {'key': None}).get('key', None)
    if correct_key is None:
        raise Exception('could not determine correct_key')
    number_answers = len(data['params'][name])
    all_keys = [pl.index2key(i) for i in range(number_answers)]
    incorrect_keys = list(set(all_keys) - set([correct_key]))

    result = data['test_type']
    if result == 'correct':
        data['raw_submitted_answers'][name] = data['correct_answers'][name]['key']
        feedback = data['correct_answers'][name].get('feedback', None)
        data['partial_scores'][name] = {'score': 1, 'weight': weight, 'feedback': feedback}
    elif result == 'incorrect':
        if len(incorrect_keys) > 0:
            random_key = random.choice(incorrect_keys)
            data['raw_submitted_answers'][name] = random_key
            for option in data['params'][name]:
                if option['key'] == random_key:
                    feedback = option.get('feedback', None)
            data['partial_scores'][name] = {'score': 0, 'weight': weight, 'feedback': feedback}
        else:
            # actually an invalid submission
            data['raw_submitted_answers'][name] = '0'
            data['format_errors'][name] = 'INVALID choice'
    elif result == 'invalid':
        data['raw_submitted_answers'][name] = '0'
        data['format_errors'][name] = 'INVALID choice'

        # FIXME: add more invalid choices
    else:
        raise Exception('invalid result: %s' % result)
