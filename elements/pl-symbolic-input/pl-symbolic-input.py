import prairielearn as pl
import lxml.html
from html import escape
import chevron
import sympy
import random
import math
import python_helper_sympy as phs


WEIGHT_DEFAULT = 1
CORRECT_ANSWER_DEFAULT = None
VARIABLES_DEFAULT = None
LABEL_DEFAULT = None
DISPLAY_DEFAULT = 'inline'
ALLOW_COMPLEX_DEFAULT = False
IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT = 'i'
SIZE_DEFAULT = 35
SHOW_HELP_TEXT_DEFAULT = True
PLACEHOLDER_TEXT_THRESHOLD = 15  # Minimum size to show the placeholder text
ALLOW_BLANK_DEFAULT = False
BLANK_VALUE_DEFAULT = '0'


def get_variables_list(variables_string):
    if variables_string is not None:
        variables_list = [variable.strip() for variable in variables_string.split(',')]
        return variables_list
    else:
        return []


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers-name']
    optional_attribs = ['weight', 'correct-answer', 'variables', 'label', 'display', 'allow-complex', 'imaginary-unit-for-display', 'size', 'show-help-text', 'allow-blank', 'blank-value']
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, 'answers-name')

    correct_answer = pl.get_string_attrib(element, 'correct-answer', CORRECT_ANSWER_DEFAULT)
    if correct_answer is not None:
        if name in data['correct_answers']:
            raise Exception('duplicate correct_answers variable name: %s' % name)
        data['correct_answers'][name] = correct_answer

    imaginary_unit = pl.get_string_attrib(element, 'imaginary-unit-for-display', IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT)
    if not (imaginary_unit == 'i' or imaginary_unit == 'j'):
        raise Exception('imaginary-unit-for-display must be either i or j')


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    label = pl.get_string_attrib(element, 'label', LABEL_DEFAULT)
    variables_string = pl.get_string_attrib(element, 'variables', VARIABLES_DEFAULT)
    variables = get_variables_list(variables_string)
    display = pl.get_string_attrib(element, 'display', DISPLAY_DEFAULT)
    allow_complex = pl.get_boolean_attrib(element, 'allow-complex', ALLOW_COMPLEX_DEFAULT)
    imaginary_unit = pl.get_string_attrib(element, 'imaginary-unit-for-display', IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT)
    size = pl.get_integer_attrib(element, 'size', SIZE_DEFAULT)

    operators = ['cos', 'sin', 'tan', 'arccos', 'arcsin', 'arctan', 'acos', 'asin', 'atan', 'arctan2', 'atan2', 'exp', 'log', 'sqrt', '( )', '+', '-', '*', '/', '^', '**']
    constants = ['pi', 'e']

    if data['panel'] == 'question':
        editable = data['editable']
        raw_submitted_answer = data['raw_submitted_answers'].get(name, None)

        info_params = {
            'format': True,
            'variables': variables,
            'operators': operators,
            'constants': constants,
            'allow_complex': allow_complex,
        }
        with open('pl-symbolic-input.mustache', 'r', encoding='utf-8') as f:
            info = chevron.render(f, info_params).strip()
        with open('pl-symbolic-input.mustache', 'r', encoding='utf-8') as f:
            info_params.pop('format', None)
            info_params['shortformat'] = True
            shortinfo = chevron.render(f, info_params).strip()

        html_params = {
            'question': True,
            'name': name,
            'label': label,
            'editable': editable,
            'info': info,
            'shortinfo': shortinfo,
            'size': size,
            'show_info': pl.get_boolean_attrib(element, 'show-help-text', SHOW_HELP_TEXT_DEFAULT),
            'uuid': pl.get_uuid(),
            'allow_complex': allow_complex,
            'show_placeholder': size >= PLACEHOLDER_TEXT_THRESHOLD
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

        if display == 'inline':
            html_params['inline'] = True
        elif display == 'block':
            html_params['block'] = True
        else:
            raise ValueError('method of display "%s" is not valid (must be "inline" or "block")' % display)
        if raw_submitted_answer is not None:
            html_params['raw_submitted_answer'] = escape(raw_submitted_answer)
        with open('pl-symbolic-input.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'submission':
        parse_error = data['format_errors'].get(name, None)

        html_params = {
            'submission': True,
            'label': label,
            'parse_error': parse_error,
            'uuid': pl.get_uuid()
        }
        if parse_error is None and name in data['submitted_answers']:
            a_sub = data['submitted_answers'][name]
            if isinstance(a_sub, str):
                # this is for backward-compatibility
                a_sub = phs.convert_string_to_sympy(a_sub, variables, allow_complex=allow_complex)
            else:
                a_sub = phs.json_to_sympy(a_sub, allow_complex=allow_complex)
            a_sub = a_sub.subs(sympy.I, sympy.Symbol(imaginary_unit))
            html_params['a_sub'] = sympy.latex(a_sub)
        elif name not in data['submitted_answers']:
            html_params['missing_input'] = True
            html_params['parse_error'] = None
        else:
            # Use the existing format text in the invalid popup.
            info_params = {
                'format': True,
                'variables': variables,
                'operators': operators,
                'constants': constants,
                'allow_complex': allow_complex,
            }
            with open('pl-symbolic-input.mustache', 'r', encoding='utf-8') as f:
                info = chevron.render(f, info_params).strip()

            # Render invalid popup
            raw_submitted_answer = data['raw_submitted_answers'].get(name, None)
            with open('pl-symbolic-input.mustache', 'r', encoding='utf-8') as f:
                parse_error += chevron.render(f, {'format_error': True, 'format_string': info}).strip()

            html_params['parse_error'] = parse_error
            if raw_submitted_answer is not None:
                html_params['raw_submitted_answer'] = pl.escape_unicode_string(raw_submitted_answer)

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

        if display == 'inline':
            html_params['inline'] = True
        elif display == 'block':
            html_params['block'] = True
        else:
            raise ValueError('method of display "%s" is not valid (must be "inline" or "block")' % display)

        html_params['error'] = html_params['parse_error'] or html_params.get('missing_input', False)

        with open('pl-symbolic-input.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'answer':
        a_tru = data['correct_answers'].get(name, None)
        if a_tru is not None:
            if isinstance(a_tru, str):
                # this is so instructors can specify the true answer simply as a string
                a_tru = phs.convert_string_to_sympy(a_tru, variables, allow_complex=allow_complex)
            else:
                a_tru = phs.json_to_sympy(a_tru, allow_complex=allow_complex)
            a_tru = a_tru.subs(sympy.I, sympy.Symbol(imaginary_unit))
            html_params = {
                'answer': True,
                'label': label,
                'a_tru': sympy.latex(a_tru)
            }
            with open('pl-symbolic-input.mustache', 'r', encoding='utf-8') as f:
                html = chevron.render(f, html_params).strip()
        else:
            html = ''

    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    variables = get_variables_list(pl.get_string_attrib(element, 'variables', VARIABLES_DEFAULT))
    allow_complex = pl.get_boolean_attrib(element, 'allow-complex', ALLOW_COMPLEX_DEFAULT)
    imaginary_unit = pl.get_string_attrib(element, 'imaginary-unit-for-display', IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT)
    allow_blank = pl.get_boolean_attrib(element, 'allow-blank', ALLOW_BLANK_DEFAULT)
    blank_value = pl.get_string_attrib(element, 'blank-value', str(BLANK_VALUE_DEFAULT))

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data['submitted_answers'].get(name, None)
    if allow_blank and a_sub is not None and a_sub.strip() == '':
        a_sub = blank_value
    if not a_sub:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = None
        return

    # Parse the submitted answer and put the result in a string
    try:
        # Replace '^' with '**' wherever it appears. In MATLAB, either can be used
        # for exponentiation. In python, only the latter can be used.
        a_sub = a_sub.replace('^', '**')

        # Replace unicode minus with hyphen minus wherever it occurs
        a_sub = a_sub.replace(u'\u2212', '-')

        # Strip whitespace
        a_sub = a_sub.strip()

        # Convert safely to sympy
        a_sub_parsed = phs.convert_string_to_sympy(a_sub, variables, allow_complex=allow_complex)

        # If complex numbers are not allowed, raise error if expression has the imaginary unit
        if (not allow_complex) and (a_sub_parsed.has(sympy.I)):
            a_sub_parsed = a_sub_parsed.subs(sympy.I, sympy.Symbol(imaginary_unit))
            s = 'Your answer was simplified to this, which contains a complex number (denoted ${:s}$): $${:s}$$'.format(imaginary_unit, sympy.latex(a_sub_parsed))
            data['format_errors'][name] = s
            data['submitted_answers'][name] = None
            return

        # Store result as json.
        a_sub_json = phs.sympy_to_json(a_sub_parsed, allow_complex=allow_complex)
    except phs.HasFloatError as err:
        s = 'Your answer contains the floating-point number ' + str(err.n) + '. '
        s += 'All numbers must be expressed as integers (or ratios of integers). '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        data['format_errors'][name] = s
        data['submitted_answers'][name] = None
        return
    except phs.HasComplexError as err:
        s = 'Your answer contains the complex number ' + str(err.n) + '. '
        s += 'All numbers must be expressed as integers (or ratios of integers). '
        if allow_complex:
            s += 'To include a complex number in your expression, write it as the product of an integer with the imaginary unit <code>i</code> or <code>j</code>. '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        data['format_errors'][name] = s
        data['submitted_answers'][name] = None
        return
    except phs.HasInvalidExpressionError as err:
        s = 'Your answer has an invalid expression. '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        data['format_errors'][name] = s
        data['submitted_answers'][name] = None
        return
    except phs.HasInvalidFunctionError as err:
        s = 'Your answer calls an invalid function "' + err.text + '". '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        data['format_errors'][name] = s
        data['submitted_answers'][name] = None
        return
    except phs.HasInvalidVariableError as err:
        s = 'Your answer refers to an invalid variable "' + err.text + '". '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        data['format_errors'][name] = s
        data['submitted_answers'][name] = None
        return
    except phs.HasParseError as err:
        s = 'Your answer has a syntax error. '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        data['format_errors'][name] = s
        data['submitted_answers'][name] = None
        return
    except phs.HasEscapeError as err:
        s = 'Your answer must not contain the character "\\". '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        data['format_errors'][name] = s
        data['submitted_answers'][name] = None
        return
    except phs.HasCommentError as err:
        s = 'Your answer must not contain the character "#". '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        data['format_errors'][name] = s
        data['submitted_answers'][name] = None
        return
    except Exception:
        data['format_errors'][name] = 'Invalid format.'
        data['submitted_answers'][name] = None
        return

    # Make sure we can parse the json again
    try:
        # Convert safely to sympy
        phs.json_to_sympy(a_sub_json, allow_complex=allow_complex)

        # Finally, store the result
        data['submitted_answers'][name] = a_sub_json
    except Exception:
        s = 'Your answer was simplified to this, which contains an invalid expression: $${:s}$$'.format(sympy.latex(a_sub_parsed))
        data['format_errors'][name] = s
        data['submitted_answers'][name] = None


def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    variables = get_variables_list(pl.get_string_attrib(element, 'variables', VARIABLES_DEFAULT))
    allow_complex = pl.get_boolean_attrib(element, 'allow-complex', ALLOW_COMPLEX_DEFAULT)
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = data['correct_answers'].get(name, None)
    if a_tru is None:
        return

    # Get submitted answer (if it does not exist, score is zero)
    a_sub = data['submitted_answers'].get(name, None)
    if a_sub is None:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
        return

    # Parse true answer
    if isinstance(a_tru, str):
        # this is so instructors can specify the true answer simply as a string
        a_tru = phs.convert_string_to_sympy(a_tru, variables, allow_complex=allow_complex)
    else:
        a_tru = phs.json_to_sympy(a_tru, allow_complex=allow_complex)

    # Parse submitted answer
    if isinstance(a_sub, str):
        # this is for backward-compatibility
        a_sub = phs.convert_string_to_sympy(a_sub, variables, allow_complex=allow_complex)
    else:
        a_sub = phs.json_to_sympy(a_sub, allow_complex=allow_complex)

    # Check equality
    correct = a_tru.equals(a_sub)

    if correct:
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    else:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}


def test(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)

    result = data['test_type']
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
            data['raw_submitted_answers'][name] = 'aatan(x)'
            s = 'Your answer calls an invalid function "' + 'aatan' + '". '
            s += '<br><br><pre>' + phs.point_to_error('aatan(x)', 0) + '</pre>'
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
