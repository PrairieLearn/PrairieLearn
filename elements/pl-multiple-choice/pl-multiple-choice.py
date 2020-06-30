import prairielearn as pl
import lxml.html
import random
import math
import chevron

WEIGHT_DEFAULT = 1
INLINE_DEFAULT = False


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers-name']
    optional_attribs = ['weight', 'number-answers', 'fixed-order', 'inline', 'enable-nota', 'enable-aota']
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, 'answers-name')

    correct_answers = []
    incorrect_answers = []
    index = 0
    for child in element:
        if child.tag in ['pl-answer', 'pl_answer']:
            pl.check_attribs(child, required_attribs=[], optional_attribs=['correct'])
            correct = pl.get_boolean_attrib(child, 'correct', False)
            child_html = pl.inner_html(child)
            answer_tuple = (index, correct, child_html)
            if correct:
                correct_answers.append(answer_tuple)
            else:
                incorrect_answers.append(answer_tuple)
            index += 1

    len_correct = len(correct_answers)
    len_incorrect = len(incorrect_answers)
    len_total = len_correct + len_incorrect

    enable_nota = pl.get_boolean_attrib(element, 'enable-nota', False)
    enable_aota = pl.get_boolean_attrib(element, 'enable-aota', False)

    nota_correct = False
    aota_correct = False
    if enable_nota or enable_aota:
        prob_space = len_correct + enable_nota + enable_aota
        rand_int = random.randint(1, prob_space)
        # Either 'None of the above' or 'All of the above' is correct
        # with probability 1/(number_correct + enable-nota + enable-aota).
        # However, if len_correct is 0, nota_correct is guaranteed to be True.
        # Thus, if no correct option is given, 'None of the above' will always
        # be correct, and 'All of the above' always incorrect
        nota_correct = (enable_nota and rand_int == 1) or len_correct == 0
        # 'All of the above' will be chosen as correct only when there is
        # at least 1 correct choice to avoid confusion
        aota_correct = enable_aota and rand_int == 2 and len_correct > 0

    # d_correct = (nota_correct + aota_correct)

    if len_correct < 1 and not nota_correct:
        raise Exception('pl-multiple-choice element must have at least one correct answer')

    # 1. Determine number of answers to display
    number_answers = pl.get_integer_attrib(element, 'number-answers', len_total + enable_nota + enable_aota)
    if enable_aota:
        # min number if 'All of the above' is correct
        number_answers = min(1 + len_correct + enable_nota, number_answers)
    # For simplicity, (1 + len_incorrect) is the min number for all other cases
    number_answers = max(1, int(enable_nota + enable_aota), min(1 + len_incorrect, number_answers))

    number_correct = 1
    number_incorrect = number_answers - number_correct

    if aota_correct:
        number_correct = number_answers - 1 - enable_nota
        number_incorrect = int(enable_nota)

    if not (0 <= number_incorrect <= len_incorrect):
        raise Exception('INTERNAL ERROR: number_incorrect: (%d, %d, %d)' % (number_incorrect, len_incorrect, number_answers))

    # 2. Sample corret and incorrect choices
    d_incorrect = (enable_nota and not nota_correct) + (enable_aota and not aota_correct)
    sampled_correct = random.sample(correct_answers, number_correct - nota_correct)
    sampled_incorrect = random.sample(incorrect_answers, max(0, number_incorrect - d_incorrect))

    sampled_answers = sampled_correct + sampled_incorrect
    random.shuffle(sampled_answers)

    # 3. Modify sampled choices
    if enable_aota:
        # Add 'All of the above' option after shuffling
        sampled_answers.append((index, aota_correct, 'All of the above'))
        index += 1

    if enable_nota:
        # Add 'None of the above' option after shuffling
        sampled_answers.append((index, nota_correct, 'None of the above'))
        index += 1

    fixed_order = pl.get_boolean_attrib(element, 'fixed-order', False)
    if fixed_order:
        # we can't simply skip the shuffle because we already broke the original
        # order by separating into correct/incorrect lists
        sampled_answers.sort(key=lambda a: a[0])  # sort by stored original index

    # 4. Write to data
    # Because 'All of the above' is below all the correct options when it's
    # true. The variable correct_answer will save it as correct
    display_answers = []
    correct_answer = None
    for (i, (index, correct, html)) in enumerate(sampled_answers):
        keyed_answer = {'key': chr(ord('a') + i), 'html': html}
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

        # Set up the templating for each answer
        answerset = []
        for answer in answers:
            answer_html = {
                'key': answer['key'],
                'checked': (submitted_key == answer['key']),
                'html': answer['html'],
                'display_score_badge': display_score and submitted_key == answer['key']
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
            'answers': answerset
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
            'uuid': pl.get_uuid()
        }

        if parse_error is None:
            submitted_answer = next(filter(lambda a: a['key'] == submitted_key, answers), None)
            html_params['key'] = submitted_key
            html_params['answer'] = submitted_answer

            partial_score = data['partial_scores'].get(name, {'score': None})
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

        with open('pl-multiple-choice.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    elif data['panel'] == 'answer':
        correct_answer = data['correct_answers'].get(name, None)
        if correct_answer is None:
            html = 'ERROR: No true answer'
        else:
            html = '(%s) %s' % (correct_answer['key'], correct_answer['html'])
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

    data['partial_scores'][name] = {'score': score, 'weight': weight}


def test(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)

    correct_key = data['correct_answers'].get(name, {'key': None}).get('key', None)
    if correct_key is None:
        raise Exception('could not determine correct_key')
    number_answers = len(data['params'][name])
    all_keys = [chr(ord('a') + i) for i in range(number_answers)]
    incorrect_keys = list(set(all_keys) - set([correct_key]))

    result = data['test_type']
    if result == 'correct':
        data['raw_submitted_answers'][name] = data['correct_answers'][name]['key']
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    elif result == 'incorrect':
        if len(incorrect_keys) > 0:
            data['raw_submitted_answers'][name] = random.choice(incorrect_keys)
            data['partial_scores'][name] = {'score': 0, 'weight': weight}
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
