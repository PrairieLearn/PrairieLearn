import prairielearn as pl
import lxml.html
import random
import math
import chevron


WEIGHT_DEFAULT = 1
FIXED_STATEMENTS_ORDER_DEFAULT = False
FIXED_OPTIONS_ORDER_DEFAULT = False
INLINE_DEFAULT = False
PARTIAL_CREDIT_DEFAULT = True
HIDE_ANSWER_PANEL_DEFAULT = False
HIDE_HELP_TEXT_DEFAULT = False
DETAILED_HELP_TEXT_DEFAULT = False
HIDE_SCORE_BADGE_DEFAULT = False
BLANK_DEFAULT = True
BLANK_ANSWER = ' '
NOTA_DEFAULT = False
COUNTER_TYPE_DEFAULT = 'lower-alpha'


def get_form_name(answers_name, index):
    return f'{answers_name}-dropdown-{index}'


def get_counter(i, counter_type):
    """Converts an integer counter to the specified CSS counter type"""
    if counter_type == 'lower-alpha':
        return pl.index2key(i - 1)
    elif counter_type == 'upper-alpha':
        return pl.index2key(i - 1).upper()
    elif counter_type == 'decimal':
        return str(i)
    elif counter_type == 'full-text':
        return ''
    else:
        raise Exception(f'Illegal counter-type in pl-matching element: "{counter_type}" should be "decimal", "lower-alpha", "upper-alpha", or "full-text".')


def legal_answer(answer, options):
    """Checks that the given answer is within the range of the given counter type."""
    return 0 <= answer < len(options)


def get_select_options(options_list, selected_value, blank_used):
    def transform(i, opt):
        index = i - int(blank_used)
        return {
            'index': index,
            'value': opt,
            'selected': 'selected' if index == selected_value else ''
        }

    return [transform(i, opt) for i, opt in enumerate(options_list)]


def partition(data, pred):
    """Implements a partition function, splitting the data into two lists based on the predicate."""
    yes, no = [], []
    for d in data:
        if pred(d):
            yes.append(d)
        else:
            no.append(d)
    return (yes, no)


def categorize_matches(element, data):
    """Get provided statements and options from the pl-matching element"""
    options = {}
    statements = []
    index = 0

    # Sort the elements so that pl-options come first.
    children = element[:]
    children.sort(key=lambda child: child.tag)

    def make_option(name, html):
        nonlocal index
        option = {'index': index, 'name': name, 'html': html}
        index += 1
        return option

    for child in children:
        if child.tag in ['pl-option', 'pl_option']:
            pl.check_attribs(child, required_attribs=[], optional_attribs=['name'])
            child_html = pl.inner_html(child)
            option_name = pl.get_string_attrib(child, 'name', child_html)

            # An option object has: index of appearance in the pl-matching element;
            # the name attribute; and the html content.
            option = make_option(option_name, child_html)
            options[option_name] = option

        elif child.tag in ['pl-statement', 'pl_statement']:
            pl.check_attribs(child, required_attribs=['match'], optional_attribs=[])
            child_html = pl.inner_html(child)
            match_name = pl.get_string_attrib(child, 'match')
            if match_name not in options:
                new_option = make_option(match_name, match_name)
                options[match_name] = new_option

            # A statement object has: the name attribute of the correct matching option; and
            # the html content.
            statement = {'match': match_name, 'html': child_html}
            statements.append(statement)

    return list(options.values()), statements


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)

    required_attribs = ['answers-name']
    optional_attribs = ['fixed-order', 'number-statements', 'number-options', 'none-of-the-above', 'blank', 'counter-type']
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, 'answers-name')
    options, statements = categorize_matches(element, data)

    # Choose and randomize the options and statements. Each can be in a fixed order.
    fixed_statements_order = pl.get_boolean_attrib(element, 'fixed-order', FIXED_STATEMENTS_ORDER_DEFAULT)
    number_statements = pl.get_integer_attrib(element, 'number-statements', len(statements))
    number_options = pl.get_integer_attrib(element, 'number-options', len(options))
    nota = pl.get_boolean_attrib(element, 'none-of-the-above', NOTA_DEFAULT)

    # Organize the list of statements to use.
    if fixed_statements_order:
        if number_statements < len(statements):
            # Take a random sampling, but maintain the original order of the statements.
            indices = random.sample(range(len(statements)), number_statements)
            statements = [statements[i] for i in sorted(indices)]
        # Otherwise, just use all the statements as-is.
    else:
        # Shuffle or sample the statements.
        if number_statements < len(statements):
            statements = random.sample(statements, number_statements)
        else:
            random.shuffle(statements)

    # Organize the list of options to use.
    # First, select all the options associated with the chosen statements.
    needed_options_keys = set((s['match'] for s in statements))
    needed_options, distractors = partition(options, lambda opt: opt['name'] in needed_options_keys)

    if len(needed_options) < number_options:
        # The limit is set above the # of options needed to match the chosen statements.
        # Add distractor options; and None of the Above if needed.
        more_needed = number_options - len(needed_options)
        if more_needed >= len(distractors):
            # Add all distractors.
            needed_options.extend(distractors)
            # Add NOTA if that's still not enough.
            if more_needed > len(distractors):
                nota = True
        else:
            # Add a sample of the distractors.
            needed_options.extend(random.sample(distractors, more_needed))
        options = needed_options
        random.shuffle(options)

    elif len(needed_options) > number_options:
        # The limit is set below the # of options needed.
        # Add None of the Above to compensate.
        options = random.sample(needed_options, number_options)
        nota = True
    else:
        # The number of needed options matches the total options.
        options = needed_options
        random.shuffle(options)

    if nota:
        options.append({'index': len(options), 'name': '__nota__', 'html': 'None of the above'})

    # Build the options to display to the student.
    chosen_option_names = []
    display_options = []
    for (i, opt) in enumerate(options):
        keyed_option = {'key': opt['name'], 'html': opt['html']}
        display_options.append(keyed_option)
        chosen_option_names.append(opt['name'])

    # Build the statements to display to the student.
    display_statements = []
    correct_matches = []
    for (i, statement) in enumerate(statements):
        # Check if the matched option was removed from the display_options to make room for
        # none-of-the-above option.
        if nota and statement['match'] not in chosen_option_names:
            match_index = len(options) - 1
        else:
            match_index = chosen_option_names.index(statement['match'])

        keyed_statement = {'key': str(i), 'html': statement['html'], 'match': statement['match']}
        display_statements.append(keyed_statement)
        correct_matches.append(match_index)

    data['params'][name] = (display_statements, display_options)
    data['correct_answers'][name] = correct_matches


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    display_statements, display_options = data['params'].get(name)
    submitted_answers = data['submitted_answers']

    for i in range(len(display_statements)):
        expected_html_name = get_form_name(name, i)
        try:
            student_answer = int(submitted_answers.get(expected_html_name, None))
        except (ValueError, TypeError):
            data['format_errors'][expected_html_name] = 'The submitted answer is not a legal option.'
            continue

        # A blank is a valid submission from the HTML, but causes a format error.
        if student_answer == -1:
            data['format_errors'][expected_html_name] = 'The submitted answer was left blank.'
        elif student_answer is None:
            data['format_errors'][expected_html_name] = 'No answer was submitted.'
        else:
            if not legal_answer(student_answer, display_options):
                data['format_errors'][expected_html_name] = 'The submitted answer is invalid.'


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    display_statements, display_options = data['params'].get(name, ([], []))
    submitted_answers = data['submitted_answers']
    counter_type = pl.get_string_attrib(element, 'counter-type', COUNTER_TYPE_DEFAULT)
    hide_score_badge = pl.get_boolean_attrib(element, 'hide-score-badge', HIDE_SCORE_BADGE_DEFAULT)
    blank_start = pl.get_boolean_attrib(element, 'blank', BLANK_DEFAULT)
    show_answer_feedback = not hide_score_badge
    no_counters = counter_type == 'full-text'

    if not no_counters:
        dropdown_options = [get_counter(i + 1, counter_type) for i in range(len(display_options))]
    else:
        dropdown_options = [display_options[i]['html'] for i in range(len(display_options))]
    if blank_start:
        dropdown_options.insert(0, BLANK_ANSWER)

    html = ''

    if data['panel'] == 'question':
        partial_score = data['partial_scores'].get(name, {'score': None})
        score = partial_score.get('score', None)
        display_score_badge = score is not None and show_answer_feedback

        statement_set = []
        for i, statement in enumerate(display_statements):
            form_name = get_form_name(name, statement['key'])
            student_answer = int(submitted_answers.get(form_name, -1))
            correct_answer = data['correct_answers'].get(name)[i]

            statement_html = {
                'html': statement['html'].strip(),
                'options': get_select_options(dropdown_options, student_answer, blank_start),
                'name': form_name,
                'display_score_badge': display_score_badge,
                'correct': display_score_badge and student_answer == correct_answer
            }
            statement_set.append(statement_html)

        option_set = []
        for option in display_options:
            option_html = {
                'key': option['key'],
                'html': option['html'].strip()
            }
            option_set.append(option_html)

        html_params = {
            'question': True,
            'name': name,
            'uuid': pl.get_uuid(),
            'statements': statement_set,
            'options': option_set,
            'counter_type': counter_type,
            'no_counters': no_counters
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
            statement_set = []
            for i, statement in enumerate(display_statements):
                form_name = get_form_name(name, statement['key'])
                student_answer = int(submitted_answers.get(form_name, -1))
                correct_answer = data['correct_answers'].get(name)[i]

                parse_error = data['format_errors'].get(form_name, None)
                display_score_badge = parse_error is None and score is not None and show_answer_feedback
                if student_answer == -1 or counter_type == 'full-text':
                    counter = ''
                else:
                    counter = f'{get_counter(student_answer + 1, counter_type)}. '
                statement_html = {
                    'option': '[blank]' if student_answer == -1 else display_options[student_answer]['html'],
                    'counter': counter,
                    'disabled': 'disabled',
                    'display_score_badge': display_score_badge,
                    'correct': display_score_badge and student_answer == correct_answer,
                    'parse_error': parse_error,
                    'statement': statement['html']
                }
                statement_set.append(statement_html)

            option_set = []
            for option in display_options:
                option_html = {
                    'key': option['key'],
                    'html': option['html'].strip()
                }
                option_set.append(option_html)

            html_params = {
                'submission': True,
                'statements': statement_set,
                'options': option_set,
                'display_score_badge': score is not None,
                'counter_type': counter_type,
                'no_counters': no_counters
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

            statement_set = []
            for i, statement in enumerate(display_statements):
                form_name = get_form_name(name, statement['key'])
                correct_answer = correct_answer_list[i]
                if counter_type == 'full-text':
                    counter = ''
                else:
                    counter = f'{get_counter(i + 1, counter_type)}. '
                statement_html = {
                    'option': display_options[correct_answer]['html'],
                    'statement': statement['html'],
                    'counter': counter,
                }
                statement_set.append(statement_html)

            option_set = []
            for option in display_options:
                option_html = {
                    'key': option['key'],
                    'html': option['html'].strip()
                }
                option_set.append(option_html)

            html_params = {
                'answer': True,
                'statements': statement_set,
                'options': option_set,
                'counter_type': counter_type,
                'no_counters': no_counters
            }
            with open('pl-matching.mustache', 'r', encoding='utf-8') as f:
                html = chevron.render(f, html_params).strip()

    return html


def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)
    partial_credit = pl.get_boolean_attrib(element, 'partial-credit', PARTIAL_CREDIT_DEFAULT)
    display_statements, _ = data['params'][name]
    number_statements = len(display_statements)

    submitted_answers = data['submitted_answers']
    correct_answers = data['correct_answers'].get(name, [])

    # Count the number of answers that are correct.
    num_correct = 0
    for i in range(number_statements):
        expected_html_name = get_form_name(name, i)
        student_answer = int(submitted_answers.get(expected_html_name, -1))
        correct_answer = correct_answers[i]
        if student_answer == correct_answer:
            num_correct += 1

    score = 0
    if not partial_credit and num_correct == number_statements:
        score = 1
    elif partial_credit:
        # EDC grading
        score = num_correct / number_statements
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
            correct_answer = correct_answers[i]
            data['raw_submitted_answers'][expected_html_name] = correct_answer
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    elif result == 'incorrect':
        for i in range(len(correct_answers)):
            expected_html_name = get_form_name(name, i)
            incorrect_answer = (correct_answers[i] + 1) % len(display_options)
            data['raw_submitted_answers'][expected_html_name] = incorrect_answer
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
    elif result == 'invalid':
        for i in range(len(correct_answers)):
            expected_html_name = get_form_name(name, i)
            data['raw_submitted_answers'][expected_html_name] = None
            data['format_errors'][expected_html_name] = 'No answer was submitted.'
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
