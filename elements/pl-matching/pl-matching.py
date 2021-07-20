import prairielearn as pl
import lxml.html
import random
import math
import chevron

WEIGHT_DEFAULT = 1
FIXED_ANSWER_ORDER_DEFAULT = False
INLINE_DEFAULT = False
PARTIAL_CREDIT_DEFAULT = True
HIDE_ANSWER_PANEL_DEFAULT = False
HIDE_HELP_TEXT_DEFAULT = False
DETAILED_HELP_TEXT_DEFAULT = False
HIDE_LETTER_KEYS_DEFAULT = False
HIDE_SCORE_BADGE_DEFAULT = False
BLANK_DEFAULT = False
BLANK_ANSWER = ' '
NOTA_DEFAULT = False
COUNTER_TYPE_DEFAULT = 'lower-alpha'


def get_form_name(answers_name, index):
    return f'{answers_name}-dropdown-{index}'


def get_counter(i, counter_type):
    """Converts an integer counter to the specified CSS counter type"""
    if counter_type == 'lower-alpha':
        return chr(ord('a') + i - 1)
    elif counter_type == 'upper-alpha':
        return chr(ord('A') + i - 1)
    elif counter_type == 'decimal':
        return str(i)
    else:
        raise Exception('Illegal counter_type in pl-matching element.')


def legal_answer(answer, counter_type, options):
    """Checks that the given answer is within the range of the given counter type."""
    if counter_type == 'lower-alpha':
        return 'a' <= answer <= chr(ord('a') + len(options))
    elif counter_type == 'upper-alpha':
        return 'A' <= answer <= chr(ord('A') + len(options))
    elif counter_type == 'decimal':
        return 1 <= answer <= len(options)
    else:
        raise Exception('Illegal counter_type in pl-matching element.')


def get_select_options(options_list, selected_value):
    return [{
        'value': opt,
        'selected': 'selected' if opt == selected_value else ''
    } for opt in options_list]


def categorize_matches(element, data):
    """Get provided answers and options from the pl-matching element"""
    options = {}
    answers = []
    index = 0

    # Sort the elements so that pl-answers come first.
    children = element[:]
    children.sort(key=lambda child: child.tag, reverse=True)

    for child in children:
        if child.tag in ['pl-option', 'pl_option']:
            pl.check_attribs(child, required_attribs=[], optional_attribs=['name'])
            child_html = pl.inner_html(child)
            option_name = pl.get_string_attrib(child, 'name', child_html)

            # An option tuple has: index of appearance in the pl-matching element;
            # the name attribute; and the html content.
            option_tuple = (index, option_name, child_html)
            options[option_name] = option_tuple
            index += 1

        elif child.tag in ['pl-answer', 'pl_answer']:
            pl.check_attribs(child, required_attribs=['match'], optional_attribs=[])
            child_html = pl.inner_html(child)
            match_name = pl.get_string_attrib(child, 'match')
            if match_name not in options:
                raise Exception(f'pl-answer "match" attribute of {match_name} does not match any of the pl-option elements.')

            _, match_name, _ = options[match_name]

            # An answer tuple has: the name attribute of the correct matching option; and
            # the html content.
            answer_tuple = (match_name, child_html)
            answers.append(answer_tuple)

    return list(options.values()), answers


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)

    required_attribs = ['answers-name']
    optional_attribs = ['fixed-order', 'number-answers', 'number-options', 'none-of-the-above', 'blank', 'counter-type']
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, 'answers-name')
    options, answers = categorize_matches(element, data)

    # Choose and randomize the options and answers.
    # Options are always randomized; answers can be a fixed order.
    fixed_answer_order = pl.get_boolean_attrib(element, 'fixed-answer-order', FIXED_ANSWER_ORDER_DEFAULT)
    number_answers = pl.get_integer_attrib(element, 'number-answers', len(answers))
    number_options = pl.get_integer_attrib(element, 'number-options', len(options))
    nota = pl.get_boolean_attrib(element, 'none-of-the-above', NOTA_DEFAULT)

    # Shuffle or sample the options.
    if number_options == len(options):
        random.shuffle(options)
    else:
        options = random.sample(options, number_options)
        # If we aren't using all options, there is a chance that one answer will be missing its option,
        # so we force none-of-the-above.
        nota = True
    # Then append None of the above if requested.
    if nota:
        options.append((len(options), '__nota__', 'None of the above'))

    # Answers are always sampled/shuffled unless a fixed order is required.
    if number_answers < len(answers):
        if not fixed_answer_order:
            answers = random.sample(answers, number_answers)
        else:
            answers = answers[:number_answers]  # Does this configuration even make sense?
    elif not fixed_answer_order:
        random.shuffle(answers)

    # Build the options to display to the student.
    chosen_option_names = []
    display_options = []
    for (i, (_, option_name, html)) in enumerate(options):
        keyed_option = {'key': option_name, 'html': html}
        display_options.append(keyed_option)
        chosen_option_names.append(option_name)

    # Build the answers to display to the student.
    display_answers = []
    correct_matches = []
    for (i, (match_name, html)) in enumerate(answers):
        # Check if the matched option was removed from the display_options to make room for
        # none-of-the-above option.
        if nota and match_name not in chosen_option_names:
            match_index = len(options) - 1
        else:
            match_index = chosen_option_names.index(match_name)

        keyed_answer = {'key': str(i), 'html': html, 'match': match_name}
        display_answers.append(keyed_answer)
        correct_matches.append(match_index + 1)

    data['params'][name] = (display_answers, display_options)
    data['correct_answers'][name] = correct_matches


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    display_answers, display_options = data['params'].get(name)
    submitted_answers = data['submitted_answers']
    counter_type = pl.get_string_attrib(element, 'counter-type', COUNTER_TYPE_DEFAULT)

    for i in range(len(display_answers)):
        expected_html_name = get_form_name(name, i)
        student_answer = submitted_answers.get(expected_html_name, None)

        # A blank is a valid submission from the HTML, but causes a format error.
        if student_answer is BLANK_ANSWER:
            data['format_errors'][expected_html_name] = 'The submitted answer was left blank.'
        elif student_answer is None:
            data['format_errors'][expected_html_name] = 'No answer was submitted.'
        else:
            try:
                if not legal_answer(student_answer, counter_type, display_options):
                    data['format_errors'][expected_html_name] = 'The submitted answer is invalid.'
            except Exception:
                data['format_errors'][expected_html_name] = 'The submitted answer is invalid.'


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    display_answers, display_options = data['params'].get(name)
    submitted_answers = data['submitted_answers']
    counter_type = pl.get_string_attrib(element, 'counter-type', COUNTER_TYPE_DEFAULT)
    hide_score_badge = pl.get_boolean_attrib(element, 'hide-score-badge', HIDE_SCORE_BADGE_DEFAULT)
    blank_start = pl.get_boolean_attrib(element, 'blank', BLANK_DEFAULT)
    show_answer_feedback = not hide_score_badge

    dropdown_options = [get_counter(i + 1, counter_type) for i in range(len(display_options))]
    if blank_start:
        dropdown_options.insert(0, BLANK_ANSWER)

    html = ''

    if data['panel'] == 'question':
        partial_score = data['partial_scores'].get(name, {'score': None})
        score = partial_score.get('score', None)
        display_score_badge = score is not None and show_answer_feedback

        answerset = []
        for i, answer in enumerate(display_answers):
            form_name = get_form_name(name, answer['key'])
            student_answer = submitted_answers.get(form_name, None)
            correct_answer = get_counter(data['correct_answers'].get(name)[i], counter_type)

            answer_html = {
                'html': answer['html'].strip(),
                'options': get_select_options(dropdown_options, submitted_answers.get(form_name, None)),
                'name': form_name,
                'display_score_badge': display_score_badge,
                'correct': display_score_badge and student_answer == correct_answer
            }
            answerset.append(answer_html)

        optionset = []
        for option in display_options:
            option_html = {
                'key': option['key'],
                'html': option['html'].strip()
            }
            optionset.append(option_html)

        html_params = {
            'question': True,
            'name': name,
            'uuid': pl.get_uuid(),
            'answers': answerset,
            'options': optionset,
            'counter_type': counter_type,
        }

        if score is not None:
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

        with open('pl-matching.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    elif data['panel'] == 'submission':
        parse_error = data['format_errors'].get(name, None)
        if parse_error is None:
            partial_score = data['partial_scores'].get(name, {'score': None})
            score = partial_score.get('score', None)
            answerset = []
            for i, answer in enumerate(display_answers):
                form_name = get_form_name(name, answer['key'])
                student_answer = submitted_answers.get(form_name, None)
                correct_answer = get_counter(data['correct_answers'].get(name)[i], counter_type)

                parse_error = data['format_errors'].get(form_name, None)
                display_score_badge = parse_error is None and score is not None and show_answer_feedback
                answer_html = {
                    'html': answer['html'].strip(),
                    'disabled': 'disabled',
                    'options': get_select_options(dropdown_options, submitted_answers.get(form_name, None)),
                    'display_score_badge': display_score_badge,
                    'correct': display_score_badge and student_answer == correct_answer,
                    'parse_error': parse_error
                }
                answerset.append(answer_html)

            optionset = []
            for option in display_options:
                option_html = {
                    'key': option['key'],
                    'html': option['html'].strip()
                }
                optionset.append(option_html)

            html_params = {
                'submission': True,
                'answers': answerset,
                'options': optionset,
                'display_score_badge': score is not None,
                'hide_letter_keys': pl.get_boolean_attrib(element, 'hide-letter-keys', HIDE_LETTER_KEYS_DEFAULT),
                'counter_type': counter_type,
            }

            if html_params['display_score_badge']:
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

            with open('pl-matching.mustache', 'r', encoding='utf-8') as f:
                html = chevron.render(f, html_params).strip()
    elif data['panel'] == 'answer':
        if not pl.get_boolean_attrib(element, 'hide-answer-panel', HIDE_ANSWER_PANEL_DEFAULT):
            correct_answer_list = data['correct_answers'].get(name, [])

            answerset = []
            for i, answer in enumerate(display_answers):
                form_name = get_form_name(name, answer['key'])
                correct_answer = correct_answer_list[i]

                answer_html = {
                    'html': answer['html'].strip(),
                    'options': [{'value': get_counter(correct_answer, counter_type)}],
                }
                answerset.append(answer_html)

            optionset = []
            for option in display_options:
                option_html = {
                    'key': option['key'],
                    'html': option['html'].strip()
                }
                optionset.append(option_html)

            html_params = {
                'answer': True,
                'answers': answerset,
                'options': optionset,
                'hide_letter_keys': pl.get_boolean_attrib(element, 'hide-letter-keys', HIDE_LETTER_KEYS_DEFAULT),
                'counter_type': counter_type,
            }
            with open('pl-matching.mustache', 'r', encoding='utf-8') as f:
                html = chevron.render(f, html_params).strip()

    return html


def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)
    partial_credit = pl.get_boolean_attrib(element, 'partial-credit', PARTIAL_CREDIT_DEFAULT)
    counter_type = pl.get_string_attrib(element, 'counter-type', COUNTER_TYPE_DEFAULT)
    display_answers, _ = data['params'][name]
    number_answers = len(display_answers)

    submitted_answers = data['submitted_answers']
    correct_answers = data['correct_answers'].get(name, [])

    # Count the number of answers that are correct.
    num_correct = 0
    for i in range(number_answers):
        expected_html_name = get_form_name(name, i)
        student_answer = submitted_answers.get(expected_html_name, None)
        correct_answer = get_counter(correct_answers[i], counter_type)
        if student_answer == correct_answer:
            num_correct += 1

    score = 0
    if not partial_credit and num_correct == number_answers:
        score = 1
    elif partial_credit:
        # EDC grading
        number_wrong = number_answers - num_correct
        score = 1 - 1.0 * number_wrong / number_answers
    data['partial_scores'][name] = {'score': score, 'weight': weight}


def test(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)

    _, display_options = data['params'][name]
    correct_answers = data['correct_answers'].get(name, [])

    result = data['test_type']
    if result == 'correct':
        for i in range(len(correct_answers)):
            expected_html_name = get_form_name(name, i)
            correct_answer = str(correct_answers[i])
            data['raw_submitted_answers'][expected_html_name] = correct_answer
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    elif result == 'incorrect':
        for i in range(len(correct_answers)):
            expected_html_name = get_form_name(name, i)
            incorrect_answer = str(correct_answers[i] % len(display_options) + 1)
            data['raw_submitted_answers'][expected_html_name] = incorrect_answer
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
    elif result == 'invalid':
        for i in range(len(correct_answers)):
            expected_html_name = get_form_name(name, i)
            data['raw_submitted_answers'][expected_html_name] = None
            data['format_errors'][expected_html_name] = 'No answer was submitted.'
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
