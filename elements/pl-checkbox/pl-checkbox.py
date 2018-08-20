import prairielearn as pl
import lxml.html
import random
import math


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)

    required_attribs = ['answers-name']
    optional_attribs = ['weight', 'number-answers', 'min-correct', 'max-correct', 'fixed-order', 'inline', 'hide-help-text', 'detailed-help-text', 'partial-credit', 'partial-credit-method']

    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, 'answers-name')

    partial_credit = pl.get_boolean_attrib(element, 'partial-credit', False)
    partial_credit_method = pl.get_string_attrib(element, 'partial-credit-method', 'PC')

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

    if partial_credit and partial_credit_method == 'EDC':
        if len_correct == 0:
            raise Exception('At least one correct answers must be defined when using partial-credit-method="EDC" ')

    number_answers = pl.get_integer_attrib(element, 'number-answers', len_total)
    min_correct = pl.get_integer_attrib(element, 'min-correct', 0)
    max_correct = pl.get_integer_attrib(element, 'max-correct', len(correct_answers))

    max_answers = 26  # will not display more than 26 checkbox answers

    number_answers = max(0, min(len_total, min(max_answers, number_answers)))
    min_correct = min(len_correct, min(number_answers, max(0, max(number_answers - len_incorrect, min_correct))))
    max_correct = min(len_correct, min(number_answers, max(min_correct, max_correct)))
    if not (0 <= min_correct <= max_correct <= len_correct):
        raise Exception('INTERNAL ERROR: correct number: (%d, %d, %d, %d)' % (min_correct, max_correct, len_correct, len_incorrect))
    min_incorrect = number_answers - max_correct
    max_incorrect = number_answers - min_correct
    if not (0 <= min_incorrect <= max_incorrect <= len_incorrect):
        raise Exception('INTERNAL ERROR: incorrect number: (%d, %d, %d, %d)' % (min_incorrect, max_incorrect, len_incorrect, len_correct))

    number_correct = random.randint(min_correct, max_correct)
    number_incorrect = number_answers - number_correct

    sampled_correct = random.sample(correct_answers, number_correct)
    sampled_incorrect = random.sample(incorrect_answers, number_incorrect)

    sampled_answers = sampled_correct + sampled_incorrect
    random.shuffle(sampled_answers)

    fixed_order = pl.get_boolean_attrib(element, 'fixed-order', False)
    if fixed_order:
        # we can't simply skip the shuffle because we already broke the original
        # order by separating into correct/incorrect lists
        sampled_answers.sort(key=lambda a: a[0])  # sort by stored original index

    display_answers = []
    correct_answer_list = []
    for (i, (index, correct, html)) in enumerate(sampled_answers):
        keyed_answer = {'key': chr(ord('a') + i), 'html': html}
        display_answers.append(keyed_answer)
        if correct:
            correct_answer_list.append(keyed_answer)

    if name in data['params']:
        raise Exception('duplicate params variable name: %s' % name)
    if name in data['correct_answers']:
        raise Exception('duplicate correct_answers variable name: %s' % name)
    data['params'][name] = display_answers
    data['correct_answers'][name] = correct_answer_list


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    partial_credit = pl.get_boolean_attrib(element, 'partial-credit', False)

    editable = data['editable']
    # answer feedback is not displayed when partial credit is True
    # (unless the question is disabled)
    show_answer_feedback = True
    if partial_credit and editable:
        show_answer_feedback = False

    display_answers = data['params'].get(name, [])

    inline = pl.get_boolean_attrib(element, 'inline', False)

    submitted_keys = data['submitted_answers'].get(name, [])
    # if there is only one key then it is passed as a string,
    # not as a length-one list, so we fix that next
    if isinstance(submitted_keys, str):
        submitted_keys = [submitted_keys]

    correct_answer_list = data['correct_answers'].get(name, [])
    correct_keys = [answer['key'] for answer in correct_answer_list]

    if data['panel'] == 'question':
        partial_score = data['partial_scores'].get(name, {'score': None})
        score = partial_score.get('score', None)

        html = ''
        for answer in display_answers:
            item = '  <label class="form-check-label">\n' \
                + '    <input type="checkbox" class="form-check-input"' \
                + ' name="' + name + '" value="' + answer['key'] + '"' \
                + ('' if editable else ' disabled') \
                + (' checked ' if (answer['key'] in submitted_keys) else '') \
                + ' />\n' \
                + '    (' + answer['key'] + ') ' + answer['html'].strip() + '\n' \
                + '  </label>\n'
            if score is not None and show_answer_feedback:
                if answer['key'] in submitted_keys:
                    if answer['key'] in correct_keys:
                        item = item + '<span class="badge badge-success"><i class="fa fa-check" aria-hidden="true"></i></span>&nbsp;&nbsp;&nbsp;&nbsp;'
                    else:
                        item = item + '<span class="badge badge-danger"><i class="fa fa-times" aria-hidden="true"></i></span>&nbsp;&nbsp;&nbsp;&nbsp;'
            item = f'<div class="form-check {"form-check-inline" if inline else ""}">\n' + item + '</div>\n'
            html += item
        if inline:
            html = '<p>\n' + html + '</p>\n'
        if score is not None:
            try:
                score = float(score)
                if score >= 1:
                    html = html + '&nbsp;<span class="badge badge-success"><i class="fa fa-check" aria-hidden="true"></i> 100%</span>'
                elif score > 0:
                    html = html + '&nbsp;<span class="badge badge-warning"><i class="far fa-circle" aria-hidden="true"></i> {:d}%</span>'.format(math.floor(score * 100))
                else:
                    html = html + '&nbsp;<span class="badge badge-danger"><i class="fa fa-times" aria-hidden="true"></i> 0%</span>'
            except Exception:
                raise ValueError('invalid score' + score)

        # Adds decorative help text per bootstrap formatting guidelines:
        # http://getbootstrap.com/docs/4.0/components/forms/#help-text
        # Determine whether we should add a choice selection requirement
        if not pl.get_boolean_attrib(element, 'hide-help-text', False):
            # Should we reveal the depth of the choice?
            if pl.get_boolean_attrib(element, 'detailed-help-text', False):
                min_correct = pl.get_integer_attrib(element, 'min-correct', 0)
                max_correct = pl.get_integer_attrib(element, 'max-correct', len(correct_answer_list))
                if min_correct != max_correct:
                    html = html + '<small class="form-text text-muted">Select between <b>%d</b> and <b>%d</b> options.</small>' % (min_correct, max_correct)
                else:
                    html = html + '<small class="form-text text-muted">Select exactly <b>%d</b> options.</small>' % (max_correct)
            # Generic prompt to differentiate from a radio input
            else:
                html = html + '<small class="form-text text-muted">Select all possible options that apply.</small>'

    elif data['panel'] == 'submission':

        parse_error = data['format_errors'].get(name, None)
        if parse_error is not None:
            html = parse_error
        else:
            partial_score = data['partial_scores'].get(name, {'score': None})
            score = partial_score.get('score', None)
            html_list = []
            for submitted_key in submitted_keys:
                item = ''
                submitted_html = next((a['html'] for a in display_answers if a['key'] == submitted_key), None)
                if submitted_html is None:
                    item = 'ERROR: Invalid submitted value selected: %s' % submitted_key
                else:
                    item = '(%s) %s' % (submitted_key, submitted_html)
                    if score is not None and show_answer_feedback:
                        if submitted_key in correct_keys:
                            item = item + '&nbsp;<span class="badge badge-success"><i class="fa fa-check" aria-hidden="true"></i></span>'
                        else:
                            item = item + '&nbsp;<span class="badge badge-danger"><i class="fa fa-times" aria-hidden="true"></i></span>'
                if inline:
                    item = '<span>' + item + '</span>\n'
                else:
                    item = '<p>' + item + '</p>\n'
                html_list.append(item)
            if inline:
                html = ', '.join(html_list) + '\n'
            else:
                html = '\n'.join(html_list) + '\n'
            if score is not None:
                try:
                    score = float(score)
                    if score >= 1:
                        html = html + '&nbsp;<span class="badge badge-success"><i class="fa fa-check" aria-hidden="true"></i> 100%</span>'
                    elif score > 0:
                        html = html + '&nbsp;<span class="badge badge-warning"><i class="far fa-circle" aria-hidden="true"></i> {:d}%</span>'.format(math.floor(score * 100))
                    else:
                        html = html + '&nbsp;<span class="badge badge-danger"><i class="fa fa-times" aria-hidden="true"></i> 0%</span>'
                except Exception:
                    raise ValueError('invalid score' + score)

    elif data['panel'] == 'answer':
        correct_answer_list = data['correct_answers'].get(name, [])
        if len(correct_answer_list) == 0:
            html = 'No selected answers'
        else:
            html_list = []
            for answer in correct_answer_list:
                item = '(%s) %s' % (answer['key'], answer['html'])
                if inline:
                    item = '<span>' + item + '</span>\n'
                else:
                    item = '<p>' + item + '</p>\n'
                html_list.append(item)
            if inline:
                html = ', '.join(html_list) + '\n'
            else:
                html = '\n'.join(html_list) + '\n'
    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html


def parse(element_html, element_index, data):

    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    partial_credit = pl.get_boolean_attrib(element, 'partial-credit', False)
    partial_credit_method = pl.get_string_attrib(element, 'partial-credit-method', 'EDC')

    submitted_key = data['submitted_answers'].get(name, None)
    all_keys = [a['key'] for a in data['params'][name]]

    if submitted_key is None:
        if partial_credit and partial_credit_method == 'EDC':
            data['format_errors'][name] = 'No submitted answer.'
            return
    else:
        if not set(submitted_key).issubset(set(all_keys)):
            data['format_errors'][name] = 'INVALID choice'
            return


def grade(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', 1)
    partial_credit = pl.get_boolean_attrib(element, 'partial-credit', False)
    number_answers = len(data['params'][name])
    partial_credit_method = pl.get_string_attrib(element, 'partial-credit-method', 'EDC')

    submitted_keys = data['submitted_answers'].get(name, [])
    correct_answer_list = data['correct_answers'].get(name, [])
    correct_keys = [answer['key'] for answer in correct_answer_list]

    submittedSet = set(submitted_keys)
    correctSet = set(correct_keys)

    score = 0
    if not partial_credit and submittedSet == correctSet:
        score = 1
    elif partial_credit:
        if partial_credit_method == 'PC':
            if submittedSet == correctSet:
                score = 1
            else:
                n_correct_answers = len(correctSet) - len(correctSet - submittedSet)
                points = n_correct_answers - len(submittedSet - correctSet)
                score = max(0, points / len(correctSet))
        else:  # this is the default EDC method
            number_wrong = len(submittedSet - correctSet) + len(correctSet - submittedSet)
            score = 1 - 1.0 * number_wrong / number_answers

    data['partial_scores'][name] = {'score': score, 'weight': weight}


def test(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', 1)
    partial_credit = pl.get_boolean_attrib(element, 'partial-credit', False)
    partial_credit_method = pl.get_string_attrib(element, 'partial-credit-method', 'EDC')

    correct_answer_list = data['correct_answers'].get(name, [])
    correct_keys = [answer['key'] for answer in correct_answer_list]
    number_answers = len(data['params'][name])
    all_keys = [chr(ord('a') + i) for i in range(number_answers)]

    result = random.choices(['correct', 'incorrect', 'invalid'], [5, 5, 1])[0]

    if result == 'correct':
        if len(correct_keys) == 1:
            data['raw_submitted_answers'][name] = correct_keys[0]
        elif len(correct_keys) > 1:
            data['raw_submitted_answers'][name] = correct_keys
        else:
            pass  # no raw_submitted_answer if no correct keys
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    elif result == 'incorrect':
        while True:
            # select answer keys at random
            ans = [k for k in all_keys if random.choice([True, False])]
            # break and use this choice if it isn't correct
            if set(ans) != set(correct_keys):
                break
        if partial_credit:
            if partial_credit_method == 'PC':
                if set(ans) == set(correct_keys):
                    score = 1
                else:
                    n_correct_answers = len(set(correct_keys)) - len(set(correct_keys) - set(ans))
                    points = n_correct_answers - len(set(ans) - set(correct_keys))
                    score = max(0, points / len(set(correct_keys)))
            else:  # this is the default EDC method
                number_wrong = len(set(ans) - set(correct_keys)) + len(set(correct_keys) - set(ans))
                score = 1 - 1.0 * number_wrong / number_answers
        else:
            score = 0
        data['raw_submitted_answers'][name] = ans
        data['partial_scores'][name] = {'score': score, 'weight': weight}
    elif result == 'invalid':
        if partial_credit and partial_credit_method == 'EDC':
            data['raw_submitted_answers'][name] = None
            data['format_errors'][name] = 'No submitted answer.'
        else:
            data['raw_submitted_answers'][name] = '0'
            data['format_errors'][name] = 'INVALID choice'
    else:
        raise Exception('invalid result: %s' % result)
