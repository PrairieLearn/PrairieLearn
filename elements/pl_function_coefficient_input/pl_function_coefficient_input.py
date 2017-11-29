import prairielearn as pl
import lxml.html
import random
import math
from html import escape
import chevron
import to_precision


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers_name']
    optional_attribs = ['weight', 'partial_credit', 'comparison', 'rtol', 'atol', 'digits', 'eps_digits']
    pl.check_attribs(element, required_attribs, optional_attribs)

    for child in element:
        if child.tag == 'pl_function_term':
            pl.check_attribs(child, required_attribs=['answers_name'], optional_attribs=['correct_answer', 'suffix'])
            child_name = pl.get_string_attrib(child, 'answers_name')
            correct_answer = pl.get_float_attrib(child, 'correct_answer', None)

            if correct_answer is not None:
                if child_name in data['correct_answers']:
                    raise Exception('duplicate correct_answers variable name: %s' % child_name)
                data['correct_answers'][child_name] = correct_answer

    return data


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')

    if data['panel'] == 'question':
        editable = data['editable']
        # Get each raw term: raw_submitted_answer and its suffix
        raw_terms = []
        first_term = True
        for child in element:
            if child.tag == 'pl_function_term':
                child_name = pl.get_string_attrib(child, 'answers_name')
                suffix = pl.get_string_attrib(child, 'suffix', None)
                raw_submitted_answer = data['raw_submitted_answers'].get(child_name, None)
                raw_term = {'child_name': child_name}
                if suffix is not None:
                    raw_term['suffix'] = suffix
                if raw_submitted_answer is not None:
                    raw_term['raw_submitted_answer'] = raw_submitted_answer
                raw_term['first_term'] = first_term
                raw_terms.append(raw_term)
                first_term = False

        # Get comparison parameters and info strings
        comparison = pl.get_string_attrib(element, 'comparison', 'relabs')
        if comparison == 'relabs':
            rtol = pl.get_float_attrib(element, 'rtol', 1e-5)
            atol = pl.get_float_attrib(element, 'atol', 1e-8)
            info_params = {'format': True, 'relabs': True, 'rtol': rtol, 'atol': atol}
        elif comparison == 'sigfig':
            digits = pl.get_integer_attrib(element, 'digits', 2)
            info_params = {'format': True, 'sigfig': True, 'digits': digits}
        elif comparison == 'decdig':
            digits = pl.get_integer_attrib(element, 'digits', 2)
            info_params = {'format': True, 'decdig': True, 'digits': digits}
        else:
            raise ValueError('method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")' % comparison)
        with open('pl_function_coefficient_input.mustache', 'r') as f:
            info = chevron.render(f, info_params).strip()

        # Prepare html_params
        html_params = {'question': True, 'editable': editable, 'info': info, 'raw_terms': raw_terms}
        partial_score = data['partial_scores'].get(name, {'score': None})
        score = partial_score.get('score', None)
        if score is not None:
            try:
                score = float(score)
                if score >= 1:
                    html_params['correct'] = True
                elif score > 0:
                    html_params['partial'] = math.floor(score * 100)
                else:
                    html_params['incorrect'] = True
            except:
                raise ValueError('invalid score' + score)
        with open('pl_function_coefficient_input.mustache', 'r') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'submission':
        # Get each submitted term: submitted term (raw submitted term if there was a parse error) and its suffix
        submitted_terms = []
        first_term = True
        for child in element:
            if child.tag == 'pl_function_term':
                child_name = pl.get_string_attrib(child, 'answers_name')
                suffix = pl.get_string_attrib(child, 'suffix', None)
                parse_error = data['format_errors'].get(child_name, None)
                submitted_term = {'parse_error': parse_error}
                if suffix is not None:
                    submitted_term['suffix'] = suffix
                if parse_error is None:
                    a_sub = data['submitted_answers'][child_name]
                    submitted_term['a_sub'] = '{:.12g}'.format(a_sub)
                    if a_sub >= 0 and not first_term:
                        submitted_term['a_sub'] = '+' + submitted_term['a_sub']
                else:
                    raw_submitted_answer = data['raw_submitted_answers'].get(child_name, None)
                    if raw_submitted_answer is not None:
                        submitted_term['raw_submitted_answer'] = escape(raw_submitted_answer)
                submitted_terms.append(submitted_term)
                submitted_term['first_term'] = first_term
                first_term = False

        # Prepare html_params
        html_params = {'submission': True, 'submitted_terms': submitted_terms}
        partial_score = data['partial_scores'].get(name, {'score': None})
        score = partial_score.get('score', None)
        if score is not None:
            try:
                score = float(score)
                if score >= 1:
                    html_params['correct'] = True
                elif score > 0:
                    html_params['partial'] = math.floor(score * 100)
                else:
                    html_params['incorrect'] = True
            except:
                raise ValueError('invalid score' + score)
        with open('pl_function_coefficient_input.mustache', 'r') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'answer':
        answer_terms = []
        no_answer = False
        first_term = True
        for child in element:
            if child.tag == 'pl_function_term':
                child_name = pl.get_string_attrib(child, 'answers_name')
                suffix = pl.get_string_attrib(child, 'suffix', None)
                a_tru = data['correct_answers'].get(child_name, None)
                if a_tru is not None:
                    prefix = '' if a_tru < 0 or first_term else '+'
                    # Get comparison parameters
                    comparison = pl.get_string_attrib(element, 'comparison', 'relabs')
                    if comparison == 'relabs':
                        rtol = pl.get_float_attrib(element, 'rtol', 1e-5)
                        atol = pl.get_float_attrib(element, 'atol', 1e-8)
                        # FIXME: render correctly with respect to rtol and atol
                        a_tru = '{:.12g}'.format(a_tru)
                    elif comparison == 'sigfig':
                        digits = pl.get_integer_attrib(element, 'digits', 2)
                        a_tru = to_precision.to_precision(a_tru, digits)
                    elif comparison == 'decdig':
                        digits = pl.get_integer_attrib(element, 'digits', 2)
                        a_tru = '{:.{ndigits}f}'.format(a_tru, ndigits=digits)
                    else:
                        raise ValueError('method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")' % comparison)
                    answer_term = {'a_tru': prefix + a_tru}
                    if suffix is not None:
                        answer_term['suffix'] = suffix
                    answer_terms.append(answer_term)
                # If no correct answer is provided for one of the terms:
                # set no_answer to be true (html will be empty)
                # and break out of the for loop
                else:
                    no_answer = True
                    break
                first_term = False
        if no_answer:
            html = ''
        else:
            html_params = {'answer': True, 'answer_terms': answer_terms}
            with open('pl_function_coefficient_input.mustache', 'r') as f:
                html = chevron.render(f, html_params).strip()

    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html


def parse(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    for child in element:
        if child.tag == 'pl_function_term':
            child_name = pl.get_string_attrib(child, 'answers_name')

            # Get submitted answer or return parse_error if it does not exist
            a_sub = data['raw_submitted_answers'].get(child_name, None)
            if not a_sub:
                data['format_errors'][child_name] = 'No submitted answer.'
                data['submitted_answers'][child_name] = None
                continue

            # Replace unicode minus with hyphen minus wherever it occurs
            a_sub = a_sub.replace(u'\u2212', '-')

            # Convert to float
            try:
                data['submitted_answers'][child_name] = float(a_sub)
                # submitted_answes.append(float(a_sub))
            except ValueError:
                data['format_errors'][child_name] = 'Invalid format (not a real number).'
                data['submitted_answers'][child_name] = None
    return data


def grade(element_html, element_index, data):
    # print("inside grade")
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')
    weight = pl.get_integer_attrib(element, 'weight', 1)
    partial_credit = pl.get_boolean_attrib(element, 'partial_credit', True)

    score = 0
    number_of_child = 0
    for child in element:
        if child.tag == 'pl_function_term':
            child_name = pl.get_string_attrib(child, 'answers_name')
            number_of_child += 1

            # Get true answer (if it does not exist, create no grade - leave it
            # up to the question code)
            a_tru = data['correct_answers'].get(child_name, None)
            if a_tru is None:
                # print("no score due to no true answer")
                return data

            # Get submitted answer (if it does not exist, score is zero)
            a_sub = data['submitted_answers'].get(child_name, None)
            if a_sub is None:
                # total score is zero if no partial credit is granted
                if not partial_credit:
                    data['partial_scores'][name] = {'score': 0, 'weight': weight}
                    # print("no score due to no partial credit and not submitted answer")
                    return data
                # skip this child if partial credit is allowed but submitted answer does not exist
                else:
                    continue

            # Get method of comparison, with relabs as default
            comparison = pl.get_string_attrib(element, 'comparison', 'relabs')

            # Compare submitted answer with true answer
            if comparison == 'relabs':
                rtol = pl.get_float_attrib(element, 'rtol', 1e-5)
                atol = pl.get_float_attrib(element, 'atol', 1e-8)
                correct = pl.is_correct_scalar_ra(a_sub, a_tru, rtol, atol)
            elif comparison == 'sigfig':
                digits = pl.get_integer_attrib(element, 'digits', 2)
                eps_digits = pl.get_integer_attrib(element, 'eps_digits', 3)
                correct = pl.is_correct_scalar_sf(a_sub, a_tru, digits, eps_digits)
            elif comparison == 'decdig':
                digits = pl.get_integer_attrib(element, 'digits', 2)
                eps_digits = pl.get_integer_attrib(element, 'eps_digits', 3)
                correct = pl.is_correct_scalar_dd(a_sub, a_tru, digits, eps_digits)
            else:
                raise ValueError('method of comparison "%s" is not valid' % comparison)

            score += 1 if correct else 0
            # total score is zero if no partial credit is granted and the submitted answer is wrong
            if not partial_credit and not correct:
                data['partial_scores'][name] = {'score': 0, 'weight': weight}
                # print("score = 0 due to one or more answer is wrong and no partial credit")
                return data

    # if the code reaches this point, either partial credit is granted or the student answered all terms correctly.
    score = 1.0 * score / number_of_child
    data['partial_scores'][name] = {'score': score, 'weight': weight}
    # print("score = " + str(data['partial_scores'][name]['score']))
    return data


def test(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')
    weight = pl.get_integer_attrib(element, 'weight', 1)

    correct_answer_list = data['correct_answers'].get(name, [])
    correct_keys = [answer['key'] for answer in correct_answer_list]
    number_answers = len(data['params'][name])
    all_keys = [chr(ord('a') + i) for i in range(number_answers)]

    result = random.choice(['correct', 'incorrect'])
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
        data['raw_submitted_answers'][name] = ans
        data['partial_scores'][name] = {'score': 0, 'weight': weight}

        # FIXME: test invalid answers
    else:
        raise Exception('invalid result: %s' % result)

    return data
