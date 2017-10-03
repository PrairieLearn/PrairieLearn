import prairielearn as pl
import lxml.html
from html import escape
import chevron
import sympy
import random
from python_helper_sympy import convert_string_to_sympy


def get_variables_list(variables_string):
    if variables_string is not None:
        variables_list = [variable.strip() for variable in variables_string.split(',')]
        return variables_list
    else:
        return []


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers_name']
    optional_attribs = ['weight', 'correct_answer', 'variables']
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, 'answers_name')

    correct_answer = pl.get_string_attrib(element, 'correct_answer', None)
    if correct_answer is not None:
        if name in data['correct_answers']:
            raise Exception('duplicate correct_answers variable name: %s' % name)
        data['correct_answers'][name] = correct_answer

    return data


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')
    variables_string = pl.get_string_attrib(element, 'variables', None)
    variables = get_variables_list(variables_string)

    if data['panel'] == 'question':
        editable = data['editable']
        raw_submitted_answer = data['raw_submitted_answers'].get(name, None)

        operators = ', '.join(['cos', 'sin', 'tan', 'exp', 'log', 'sqrt', '( )', '+', '-', '*', '/', '^', '**'])
        constants = ', '.join(['pi'])

        info_params = {'format': True, 'variables': variables_string, 'operators': operators, 'constants': constants}
        with open('pl_symbolic_input.mustache', 'r') as f:
            info = chevron.render(f, info_params).strip()
        with open('pl_symbolic_input.mustache', 'r') as f:
            info_params.pop('format', None)
            info_params['shortformat'] = True
            shortinfo = chevron.render(f, info_params).strip()

        html_params = {'question': True, 'name': name, 'editable': editable, 'info': info, 'shortinfo': shortinfo}
        if raw_submitted_answer is not None:
            html_params['raw_submitted_answer'] = escape(raw_submitted_answer)
        with open('pl_symbolic_input.mustache', 'r') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'submission':
        parse_error = data['format_errors'].get(name, None)
        html_params = {'submission': True, 'parse_error': parse_error}
        if parse_error is None:
            a_sub = data['submitted_answers'][name]
            a_sub = convert_string_to_sympy(a_sub, variables)
            html_params['a_sub'] = sympy.latex(a_sub)
        else:
            raw_submitted_answer = data['raw_submitted_answers'].get(name, None)
            if raw_submitted_answer is not None:
                html_params['raw_submitted_answer'] = escape(raw_submitted_answer)
        with open('pl_symbolic_input.mustache', 'r') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'answer':
        a_tru = pl.from_json(data['correct_answers'].get(name, None))
        if a_tru is not None:
            if isinstance(a_tru, str):
                a_tru = convert_string_to_sympy(a_tru, variables)
            html_params = {'answer': True, 'a_tru': sympy.latex(a_tru)}
            with open('pl_symbolic_input.mustache', 'r') as f:
                html = chevron.render(f, html_params).strip()
        else:
            html = ''

    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html


def parse(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')
    variables = get_variables_list(pl.get_string_attrib(element, 'variables', None))

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data['submitted_answers'].get(name, None)
    if not a_sub:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = None
        return data

    try:
        # Replace '^' with '**' wherever it appears. In MATLAB, either can be used
        # for exponentiation. In python, only the latter can be used.
        a_sub = a_sub.replace('^', '**')

        # Convert submitted answer safely to sympy
        a_sub = convert_string_to_sympy(a_sub, variables)

        # Store result as a string.
        data['submitted_answers'][name] = str(a_sub)
    except:
        data['format_errors'][name] = 'Invalid format.'
        data['submitted_answers'][name] = None
        return data

    return data


def grade(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')

    # Get weight
    weight = pl.get_integer_attrib(element, 'weight', 1)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = pl.from_json(data['correct_answers'].get(name, None))
    if a_tru is None:
        return data

    # Get submitted answer (if it does not exist, score is zero)
    a_sub = data['submitted_answers'].get(name, None)
    if a_sub is None:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
        return data

    # Parse both correct and submitted answer (will throw an error on fail).
    variables = get_variables_list(pl.get_string_attrib(element, 'variables', None))
    if isinstance(a_tru, str):
        a_tru = convert_string_to_sympy(a_tru, variables)
    a_sub = convert_string_to_sympy(a_sub, variables)

    # Check equality
    correct = a_tru.equals(a_sub)

    if correct:
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    else:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}

    return data


def test(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')
    weight = pl.get_integer_attrib(element, 'weight', 1)

    result = random.choices(['correct', 'incorrect', 'invalid'], [5, 5, 1])[0]
    if result == 'correct':
        data['raw_submitted_answers'][name] = str(pl.from_json(data['correct_answers'][name]))
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    elif result == 'incorrect':
        data['raw_submitted_answers'][name] = str(pl.from_json(data['correct_answers'][name])) + ' + {:d}'.format(random.randint(1, 100))
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
    elif result == 'invalid':
        if random.choice([True, False]):
            data['raw_submitted_answers'][name] = 'complete garbage'
            data['format_errors'][name] = 'Invalid format.'

        # FIXME: add more invalid choices
    else:
        raise Exception('invalid result: %s' % result)

    return data
