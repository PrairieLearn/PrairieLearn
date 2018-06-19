import prairielearn as pl
import lxml.html
from html import escape
import chevron
import sympy
import random
import math
import python_helper_sympy as phs


def get_variables_list(variables_string):
    if variables_string is not None:
        variables_list = [variable.strip() for variable in variables_string.split(',')]
        return variables_list
    else:
        return []


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers-name']
    optional_attribs = ['weight', 'correct-answer', 'variables']
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, 'answers-name')

    correct_answer = pl.get_string_attrib(element, 'correct-answer', None)
    if correct_answer is not None:
        if name in data['correct-answers']:
            raise Exception('duplicate correct-answers variable name: %s' % name)
        data['correct-answers'][name] = correct_answer


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    variables_string = pl.get_string_attrib(element, 'variables', None)
    variables = get_variables_list(variables_string)

    if data['panel'] == 'question':
        editable = data['editable']
        raw_submitted_answer = data['raw_submitted_answers'].get(name, None)

        operators = ', '.join(['cos', 'sin', 'tan', 'exp', 'log', 'sqrt', '( )', '+', '-', '*', '/', '^', '**'])
        constants = ', '.join(['pi'])

        info_params = {'format': True, 'variables': variables_string, 'operators': operators, 'constants': constants}
        with open('pl-symbolic-input.mustache', 'r', encoding='utf-8') as f:
            info = chevron.render(f, info_params).strip()
        with open('pl-symbolic-input.mustache', 'r', encoding='utf-8') as f:
            info_params.pop('format', None)
            info_params['shortformat'] = True
            shortinfo = chevron.render(f, info_params).strip()

        html_params = {
            'question': True,
            'name': name,
            'editable': editable,
            'info': info,
            'shortinfo': shortinfo,
            'uuid': pl.get_uuid()
        }

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
            except Exception:
                raise ValueError('invalid score' + score)

        if raw_submitted_answer is not None:
            html_params['raw_submitted_answer'] = escape(raw_submitted_answer)
        with open('pl-symbolic-input.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'submission':
        parse_error = data['format_errors'].get(name, None)
        html_params = {
            'submission': True,
            'parse_error': parse_error,
            'uuid': pl.get_uuid()
        }
        if parse_error is None:
            a_sub = data['submitted_answers'][name]
            a_sub = phs.convert_string_to_sympy(a_sub, variables)
            html_params['a_sub'] = sympy.latex(a_sub)
        else:
            raw_submitted_answer = data['raw_submitted_answers'].get(name, None)
            if raw_submitted_answer is not None:
                html_params['raw_submitted_answer'] = escape(raw_submitted_answer)

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
            except Exception:
                raise ValueError('invalid score' + score)

        with open('pl-symbolic-input.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'answer':
        a_tru = pl.from_json(data['correct_answers'].get(name, None))
        if a_tru is not None:
            if isinstance(a_tru, str):
                a_tru = phs.convert_string_to_sympy(a_tru, variables)
            html_params = {'answer': True, 'a_tru': sympy.latex(a_tru)}
            with open('pl-symbolic-input.mustache', 'r', encoding='utf-8') as f:
                html = chevron.render(f, html_params).strip()
        else:
            html = ''

    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html


def parse(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    variables = get_variables_list(pl.get_string_attrib(element, 'variables', None))

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data['submitted_answers'].get(name, None)
    if not a_sub:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = None
        return

    try:
        # Replace '^' with '**' wherever it appears. In MATLAB, either can be used
        # for exponentiation. In python, only the latter can be used.
        a_sub = a_sub.replace('^', '**')

        # Strip whitespace
        a_sub = a_sub.strip()

        # Convert safely to sympy
        a_sub = phs.convert_string_to_sympy(a_sub, variables)

        # Store result as a string.
        data['submitted_answers'][name] = str(a_sub)
    except phs.HasFloatError as err:
        s = 'Your answer contains the floating-point number ' + str(err.n) + '. '
        s += 'All numbers must be expressed as integers (or ratios of integers). '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        data['format_errors'][name] = s
        data['submitted_answers'][name] = None
    except phs.HasComplexError as err:
        s = 'Your answer contains the complex number ' + str(err.n) + '. '
        s += 'All numbers must be expressed as integers (or ratios of integers). '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        data['format_errors'][name] = s
        data['submitted_answers'][name] = None
    except phs.HasInvalidExpressionError as err:
        s = 'Your answer has an invalid expression. '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        data['format_errors'][name] = s
        data['submitted_answers'][name] = None
    except phs.HasInvalidFunctionError as err:
        s = 'Your answer calls an invalid function "' + err.text + '". '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        data['format_errors'][name] = s
        data['submitted_answers'][name] = None
    except phs.HasInvalidVariableError as err:
        s = 'Your answer refers to an invalid variable "' + err.text + '". '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        data['format_errors'][name] = s
        data['submitted_answers'][name] = None
    except phs.HasParseError as err:
        s = 'Your answer has a syntax error. '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        data['format_errors'][name] = s
        data['submitted_answers'][name] = None
    except phs.HasEscapeError as err:
        s = 'Your answer must not contain the character "\\". '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        data['format_errors'][name] = s
        data['submitted_answers'][name] = None
    except phs.HasCommentError as err:
        s = 'Your answer must not contain the character "#". '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        data['format_errors'][name] = s
        data['submitted_answers'][name] = None
    except Exception as err:
        data['format_errors'][name] = 'Invalid format.'
        data['submitted_answers'][name] = None


def grade(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')

    # Get weight
    weight = pl.get_integer_attrib(element, 'weight', 1)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = pl.from_json(data['correct_answers'].get(name, None))
    if a_tru is None:
        return

    # Get submitted answer (if it does not exist, score is zero)
    a_sub = data['submitted_answers'].get(name, None)
    if a_sub is None:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
        return

    # Parse both correct and submitted answer (will throw an error on fail).
    variables = get_variables_list(pl.get_string_attrib(element, 'variables', None))
    if isinstance(a_tru, str):
        a_tru = phs.convert_string_to_sympy(a_tru, variables)
    a_sub = phs.convert_string_to_sympy(a_sub, variables)

    # Check equality
    correct = a_tru.equals(a_sub)

    if correct:
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    else:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}


def test(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', 1)

    result = random.choices(['correct', 'incorrect', 'invalid'], [5, 5, 1])[0]
    if result == 'correct':
        data['raw_submitted_answers'][name] = str(pl.from_json(data['correct_answers'][name]))
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    elif result == 'incorrect':
        data['raw_submitted_answers'][name] = str(pl.from_json(data['correct_answers'][name])) + ' + {:d}'.format(random.randint(1, 100))
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
    elif result == 'invalid':
        invalid_type = random.choice(['float', 'complex', 'expression', 'function', 'variable', 'syntax', 'escape', 'comment'])
        if invalid_type == 'float':
            data['raw_submitted_answers'][name] = 'x + 1.234'
            s = 'Your answer contains the floating-point number ' + str(1.234) + '. '
            s += 'All numbers must be expressed as integers (or ratios of integers). '
            s += '<br><br><pre>' + phs.point_to_error('x + 1.234', 4) + '</pre>'
            data['format_errors'][name] = s
        elif invalid_type == 'complex':
            data['raw_submitted_answers'][name] = 'x + (1+2j)'
            s = 'Your answer contains the complex number ' + str(2j) + '. '
            s += 'All numbers must be expressed as integers (or ratios of integers). '
            s += '<br><br><pre>' + phs.point_to_error('x + (1+2j)', 7) + '</pre>'
            data['format_errors'][name] = s
        elif invalid_type == 'expression':
            data['raw_submitted_answers'][name] = '1 and 0'
            s = 'Your answer has an invalid expression. '
            s += '<br><br><pre>' + phs.point_to_error('1 and 0', 0) + '</pre>'
            data['format_errors'][name] = s
        elif invalid_type == 'function':
            data['raw_submitted_answers'][name] = 'atan(x)'
            s = 'Your answer calls an invalid function "' + 'atan' + '". '
            s += '<br><br><pre>' + phs.point_to_error('atan(x)', 0) + '</pre>'
            data['format_errors'][name] = s
        elif invalid_type == 'variable':
            data['raw_submitted_answers'][name] = 'x + y'
            s = 'Your answer refers to an invalid variable "' + 'y' + '". '
            s += '<br><br><pre>' + phs.point_to_error('x + y', 4) + '</pre>'
            data['format_errors'][name] = s
        elif invalid_type == 'syntax':
            data['raw_submitted_answers'][name] = 'x +* 1'
            s = 'Your answer has a syntax error. '
            s += '<br><br><pre>' + phs.point_to_error('x +* 1', 4) + '</pre>'
            data['format_errors'][name] = s
        elif invalid_type == 'escape':
            data['raw_submitted_answers'][name] = 'x + 1\\n'
            s = 'Your answer must not contain the character "\\". '
            s += '<br><br><pre>' + phs.point_to_error('x + 1\\n', 5) + '</pre>'
            data['format_errors'][name] = s
        elif invalid_type == 'comment':
            data['raw_submitted_answers'][name] = 'x # some text'
            s = 'Your answer must not contain the character "#". '
            s += '<br><br><pre>' + phs.point_to_error('x # some text', 2) + '</pre>'
            data['format_errors'][name] = s
        else:
            raise Exception('invalid invalid_type: %s' % invalid_type)
    else:
        raise Exception('invalid result: %s' % result)
