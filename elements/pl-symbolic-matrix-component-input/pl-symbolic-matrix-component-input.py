import prairielearn as pl
import lxml.html
from html import escape
import chevron
import math
import python_helper_sympy_allow_float as phs
import numpy as np
import random
import sympy

ALLOW_COMPLEX_DEFAULT = False
CORRECT_ANSWER_DEFAULT = None
SHOW_CORRECT_ANSWER_DEFAULT = True
# DISPLAY_DEFAULT = 'inline'
IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT = 'i'
ALLOW_PARTIAL_CREDIT_DEFAULT = False
ATOL_DEFAULT = 1e-8
COMPARISON_DEFAULT = 'relabs'
DIGITS_DEFAULT = 2
LABEL_DEFAULT = None
RTOL_DEFAULT = 1e-2
VARIABLES_DEFAULT = None
WEIGHT_DEFAULT = 1

COMPONENT_BASE_FILENAME = 'pl-symbolic-matrix-component-input'
COMPONENT_MUSTACHE_FILENAME = COMPONENT_BASE_FILENAME + '.mustache'

def ensure_sympy_matrix(A):
    err_msg = 'input should be a 2D SymPy Matrix'
    try:
        A = sympy.Matrix(A) # might raise an exception
        if len(A.shape) != 2:
            raise ValueError(err_msg)
    except Exception:
        raise ValueError(err_msg)
    return A

# This could be improved to support the other comparison types.
def sympy_poly_coeffs_compare_atol(a_sub, a_tru, atol):
    try:
        diff = sympy.simplify(a_sub - a_tru)
        if diff.is_constant():
            if abs(diff) > atol:
                return False
            else:
                return True
        else:
            for d in sympy.Poly(diff).all_coeffs():
                if abs(d) > atol:
                    return False
    except Exception:
        return False
    return True

def sympy_resub_symbols(a, allow_complex=True):
    const = phs._Constants()

    # Get list of variables in the sympy expression
    # variables = [str(v) for v in a.free_symbols]

    # # Check that variables do not conflict with reserved names
    # reserved = {**const.helpers, **const.variables, **const.hidden_variables, **const.functions}
    # if allow_complex:
    #     reserved = {**reserved, **const.complex_variables, **const.hidden_complex_variables}
    # for k in reserved.keys():
    #     for v in variables:
    #         if k == v:
    #             raise ValueError('sympy expression has a variable with a reserved name: {:s}'.format(k))

    # # Apply substitutions for hidden variables
    # a = a.subs([(const.hidden_variables[key], key) for key in const.hidden_variables.keys()])
    # if allow_complex:
    #     a = a.subs([(const.hidden_complex_variables[key], key) for key in const.hidden_complex_variables.keys()])

    a = a.subs([(const.variables[key], key) for key in const.variables.keys()])
    if allow_complex:
        a = a.subs([(const.complex_variables[key], key) for key in const.complex_variables.keys()])

    return a

def json_to_sympy_testing(a, allow_complex=True):
    if not '_type' in a:
        raise ValueError('json must have key _type for conversion to sympy')
    if a['_type'] != 'sympy':
        # raise ValueError(str(a))
        raise ValueError('json must have _type == "sympy" for conversion to sympy')
    if not '_value' in a:
        raise ValueError('json must have key _value for conversion to sympy')
    if not '_variables' in a:
        a['_variables'] = None
    return phs.convert_string_to_sympy(a['_value'], a['_variables'], allow_hidden=True, allow_complex=allow_complex)

def from_json_robust_testing(v, allow_complex=True):
    """from_json_robust(v)

    This is forked from from_jason in prairilearn.py in order to add the allow_complex argument.

    If v has the format {'_type':..., '_value':...} as would have been created
    using to_json(...), then it is replaced:

        '_type': 'complex' -> complex
        '_type': 'ndarray' -> non-complex ndarray
        '_type': 'complex_ndarray' -> complex ndarray
        '_type': 'sympy' -> sympy.Expr
        '_type': 'sympy_matrix' -> sympy.Matrix

    If v encodes an ndarray and has the field '_dtype', this function recovers
    its dtype.

    This function does not try to recover information like the assumptions on
    variables in a sympy expression.

    If v does not have the format {'_type':..., '_value':...}, then it is
    returned without change.
    """
    if isinstance(v, dict):
        if '_type' in v:
            if v['_type'] == 'complex':
                if ('_value' in v) and ('real' in v['_value']) and ('imag' in v['_value']):
                    return complex(v['_value']['real'], v['_value']['imag'])
                else:
                    raise Exception('variable of type complex should have value with real and imaginary pair')
            elif v['_type'] == 'ndarray':
                if ('_value' in v):
                    if ('_dtype' in v):
                        return np.array(v['_value']).astype(v['_dtype'])
                    else:
                        return np.array(v['_value'])
                else:
                    raise Exception('variable of type ndarray should have value')
            elif v['_type'] == 'complex_ndarray':
                if ('_value' in v) and ('real' in v['_value']) and ('imag' in v['_value']):
                    if ('_dtype' in v):
                        return (np.array(v['_value']['real']) + np.array(v['_value']['imag']) * 1j).astype(v['_dtype'])
                    else:
                        return np.array(v['_value']['real']) + np.array(v['_value']['imag']) * 1j
                else:
                    raise Exception('variable of type complex_ndarray should have value with real and imaginary pair')
            elif v['_type'] == 'sympy':
                return json_to_sympy(v, allow_complex=allow_complex)
            elif v['_type'] == 'sympy_matrix':
                if ('_value' in v) and ('_variables' in v) and ('_shape' in v):
                    value = v['_value']
                    variables = v['_variables']
                    shape = v['_shape']
                    M = sympy.Matrix.zeros(shape[0], shape[1])
                    for i in range(0, shape[0]):
                        for j in range(0, shape[1]):
                            M[i, j] = phs.convert_string_to_sympy(value[i][j], variables, allow_hidden=True, allow_complex=True)
                    return M
                else:
                    raise Exception('variable of type sympy_matrix should have value, variables, and shape')
            elif v['_type'] == 'dataframe':
                if ('_value' in v) and ('index' in v['_value']) and ('columns' in v['_value']) and ('data' in v['_value']):
                    val = v['_value']
                    return pandas.DataFrame(index=val['index'], columns=val['columns'], data=val['data'])
                else:
                    raise Exception('variable of type dataframe should have value with index, columns, and data')
            else:
                raise Exception('variable has unknown type {:s}'.format(v['_type']))
    return v

# Fork of a function in prairielearn.py
# This version is weird. Don't use. For reference only.
def latex_from_2darray_sympy_within_ndarray_testing(A, presentation_type='f', digits=2):
    r"""latex_from_2darray_sympy
    This function assumes that A is one of these things:
            - a number (float or complex)
            - a 2D ndarray (float or complex)

    If A is a scalar, the string is a single number, not wrapped in brackets.

    It A is a numpy 2D array, it returns a string with the format:
        '\begin{bmatrix} ... & ... \\ ... & ... \end{bmatrix}'

    If presentation_type is 'sigfig', each number is formatted using the
    to_precision module to "digits" significant figures.

    Otherwise, each number is formatted as '{:.{digits}{presentation_type}}'.
    """
    raise Exception("This was for early development purposes. Don't use this function.")
    # if A is a scalar
    if np.isscalar(A):
        if presentation_type == 'sigfig':
            return string_from_number_sigfig(A, digits=digits)
        else:
            return '{:.{digits}{presentation_type}}'.format(A, digits=digits, presentation_type=presentation_type)
    if presentation_type == 'sigfig':
        formatter = {
            'float_kind': lambda x: to_precision.to_precision(x, digits),
            'complex_kind': lambda x: _string_from_complex_sigfig(x, digits)
        }
    else:
        formatter = {
            'float_kind': lambda x: '{:.{digits}{presentation_type}}'.format(x, digits=digits, presentation_type=presentation_type),
            'complex_kind': lambda x: '{:.{digits}{presentation_type}}'.format(x, digits=digits, presentation_type=presentation_type)
        }
    if A.ndim != 2:
        raise ValueError('input should be a 2D numpy array')
    m = A.shape[0]
    n = A.shape[1]
    A = np.array(A)
    for i in range(0, m):
        for j in range(0, n):
            A[i,j] = sympy.latex(A[i,j])
        A[i,n-1] = A[i,n-1] + '\n'
    Astr = ''
    for i in range(0, m):
        for j in range(0, n):
            Astr += A[i,j]
        Astr += '\n'
    lines = Astr.splitlines()
    rv = [r'\begin{bmatrix}']
    rv += ['  ' + ' & '.join(l.split()) + r'\\' for l in lines]
    rv += [r'\end{bmatrix}']
    return ''.join(rv)

# Fork of a function in prairielearn.py
def latex_from_sympy_matrix(A_orig):
    err_msg = 'input should be a 2D SymPy Matrix'
    try:
        # Make sure A is of the right type and make it a working copy too.
        A_copy = sympy.Matrix(A_orig) # might raise an exception
        if len(A_copy.shape) != 2:
            raise ValueError(err_msg)
    except Exception:
        raise ValueError(err_msg)

    m = A_copy.shape[0]
    n = A_copy.shape[1]
    Astr = ''
    for i in range(0, m):
        for j in range(0, n-1):
            Astr += sympy.latex(A_copy[i,j]) + ' & '
        for j in range(n-1, n):
            Astr += sympy.latex(A_copy[i,j])
        Astr += ' \n'
    lines = Astr.splitlines()
    rv = [r'\begin{bmatrix}']
    # rv += ['  ' + ' & '.join(l.split()) + r'\\' for l in lines]
    rv += ['  ' + l + r'\\' for l in lines]
    rv += [r'\end{bmatrix}']
    return ''.join(rv)

def get_variables_list(variables_string):
    if variables_string is not None:
        variables_list = [variable.strip() for variable in variables_string.split(',')]
        return variables_list
    else:
        return []

def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers-name']
    optional_attribs = ['weight', 'label', 'comparison', 'rtol', 'atol', 'digits', 'allow-partial-credit', 'allow-feedback', 'variables', 'label', 'display', 'allow-complex', 'imaginary-unit-for-display', 'show-correct-answer']
    pl.check_attribs(element, required_attribs, optional_attribs)

    # The symbolic matrix component input doesn't support the correct-answer attribute, currently.
    # name = pl.get_string_attrib(element, 'answers-name')
    # correct_answer = pl.get_string_attrib(element, 'correct-answer', CORRECT_ANSWER_DEFAULT)
    # if correct_answer is not None:
    #     if name in data['correct-answers']:
    #         raise Exception('duplicate correct-answers variable name: %s' % name)
    #     data['correct-answers'][name] = correct_answer

    imaginary_unit = pl.get_string_attrib(element, 'imaginary-unit-for-display', IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT)
    if not (imaginary_unit == 'i' or imaginary_unit == 'j'):
        raise Exception('imaginary-unit-for-display must be either i or j')

def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    # get the name of the element, in this case, the name of the array
    name = pl.get_string_attrib(element, 'answers-name')
    label = pl.get_string_attrib(element, 'label', LABEL_DEFAULT)
    allow_partial_credit = pl.get_boolean_attrib(element, 'allow-partial-credit', ALLOW_PARTIAL_CREDIT_DEFAULT)
    allow_feedback = pl.get_boolean_attrib(element, 'allow-feedback', allow_partial_credit)
    variables_string = pl.get_string_attrib(element, 'variables', VARIABLES_DEFAULT)
    variables = get_variables_list(variables_string)
    #display = pl.get_string_attrib(element, 'display', DISPLAY_DEFAULT)
    allow_complex = pl.get_boolean_attrib(element, 'allow-complex', ALLOW_COMPLEX_DEFAULT)
    imaginary_unit = pl.get_string_attrib(element, 'imaginary-unit-for-display', IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT)
    show_correct_answer = pl.get_boolean_attrib(element, 'show-correct-answer', SHOW_CORRECT_ANSWER_DEFAULT)

    if data['panel'] == 'question':
        editable = data['editable']
        # raw_submitted_answer = data['raw_submitted_answers'].get(name, None)

        operators = ', '.join(['cos', 'sin', 'tan', 'exp', 'log', 'sqrt', '( )', '+', '-', '*', '/', '^', '**'])
        constants = ', '.join(['pi', 'e'])

        info_params = {
            'format': True,
            'variables': variables_string,
            'operators': operators,
            'constants': constants,
            'allow_complex': allow_complex
        }

        a_placeholder = data['params'].get('placeholder', None)
        if a_placeholder is not None and isinstance(a_placeholder, dict):
            raw_submitted_answers = data.get('raw_submitted_answers', {})
            if isinstance(raw_submitted_answers, dict) and len(raw_submitted_answers) == 0:
                data['raw_submitted_answers'] = dict(a_placeholder)

        # Get true answer
        a_tru = phs.from_json(data['correct_answers'].get(name, None))
        if a_tru is None:
            raise Exception('No value in data["correct_answers"] for variable %s in %s element' % (name, COMPONENT_BASE_FILENAME))
        else:
            try:
                # This conversion can raise an exception
                a_tru = sympy.Matrix(a_tru)
            except Exception:
                raise Exception('Value in data["correct_answers"] for variable %s in %s element could not be converted to SymPy Matrix.' % (name, COMPONENT_BASE_FILENAME))

        if len(a_tru.shape) != 2:
            raise Exception('Value in data["correct_answers"] for variable %s in %s element must be a 2D SymPy Matrix.' % (name, COMPONENT_BASE_FILENAME))
        else:
            m, n = a_tru.shape

        input_array = createTableForHTMLDisplay(m, n, name, label, data, 'input')

        with open(COMPONENT_MUSTACHE_FILENAME, 'r', encoding='utf-8') as f:
            info = chevron.render(f, info_params).strip()
        with open(COMPONENT_MUSTACHE_FILENAME, 'r', encoding='utf-8') as f:
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
            'input_array': input_array,
            'uuid': pl.get_uuid(),
            'allow_complex': allow_complex
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

        with open(COMPONENT_MUSTACHE_FILENAME, 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'submission':

        parse_error = data['format_errors'].get(name, None)
        html_params = {
            'submission': True,
            'label': label,
            'parse_error': parse_error,
            'uuid': pl.get_uuid()
        }

        a_tru = phs.from_json(data['correct_answers'].get(name, None))
        m, n = a_tru.shape

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

        if parse_error is None:
            # Get submitted answer, raising an exception if it does not exist
            a_sub = data['submitted_answers'].get(name, None)
            if a_sub is None:
                raise Exception('submitted answer is None')
            # If answer is in a format generated by pl.to_json, convert it back to a standard type (otherwise, do nothing)
            a_sub = phs.from_json(a_sub)
            # a_sub = json_to_sympy(a_sub, allow_complex=allow_complex)
            # a_sub = phs.from_json_robust(a_sub, allow_complex=True) # This call can handle a SymPy matrix.
            ensure_sympy_matrix(a_sub)
            # Format submitted answer as a latex string
            try:
                sub_latex = '$' + latex_from_sympy_matrix(a_sub) + '$'
            except Exception:
                sub_latex = 'Could not convert SymPy array to LaTeX string'
            # When allowing feedback, display submitted answers using html table
            sub_html_table = createTableForHTMLDisplay(m, n, name, label, data, 'output-feedback')
            if allow_feedback and score is not None:
                if score < 1:
                    html_params['a_sub_feedback'] = sub_html_table
                else:
                    html_params['a_sub'] = sub_latex
            else:
                html_params['a_sub'] = sub_latex
        else:
            # create html table to show submitted answer when there is an invalid format
            html_params['raw_submitted_answer'] = createTableForHTMLDisplay(m, n, name, label, data, 'output-invalid')

        with open(COMPONENT_MUSTACHE_FILENAME, 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'answer':

        # Get true answer - do nothing if it does not exist
        a_tru = phs.from_json(data['correct_answers'].get(name, None))
        if a_tru is not None:
            ensure_sympy_matrix(a_tru)
            try:
                latex_data = '$' + latex_from_sympy_matrix(a_tru) + '$'
            except Exception:
                latex_data = 'Could not convert SymPy array to LaTeX string'

            html_params = {
                'answer': True,
                'label': label,
                'latex_data': latex_data,
                'uuid': pl.get_uuid(),
                'show_correct_answer': show_correct_answer
            }

            with open(COMPONENT_MUSTACHE_FILENAME, 'r', encoding='utf-8') as f:
                html = chevron.render(f, html_params).strip()
        else:
            html = ''

    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html

# This will parse a string to a single SymPy element
def parse_sympy_single(a_sub, minidata):
    variables = minidata['variables']
    allow_complex = minidata['allow_complex']
    imaginary_unit = minidata['imaginary_unit']
    allow_float = phs._ALLOW_FLOAT

    # Get submitted answer or return parse_error if it does not exist
    if not a_sub:
        minidata['format_errors'] = 'No submitted answer.'
        minidata['submitted_answers'] = None
        return False

    # Parse the submitted answer and put the result in a string
    try:
        # Replace '^' with '**' wherever it appears. In MATLAB, either can be used
        # for exponentiation. In python, only the latter can be used.
        a_sub = a_sub.replace('^', '**')

        # Strip whitespace
        a_sub = a_sub.strip()

        # Convert safely to sympy
        a_sub_parsed = phs.convert_string_to_sympy(a_sub, variables, allow_complex=allow_complex)

        # If complex numbers are not allowed, raise error if expression has the imaginary unit
        if (not allow_complex) and (a_sub_parsed.has(sympy.I)):
            a_sub_parsed = a_sub_parsed.subs(sympy.I, sympy.Symbol(imaginary_unit))
            s = 'Your answer was simplified to this, which contains a complex number (denoted ${:s}$): $${:s}$$'.format(imaginary_unit, sympy.latex(a_sub_parsed))
            minidata['format_errors'] = s
            minidata['submitted_answers'] = None
            return False

        # Store result as json.
        a_sub_json = phs.sympy_to_json(a_sub_parsed, allow_complex=allow_complex)
    except phs.HasFloatError as err:
        # Currently, I'm experimenting with allowing float input, so this case may be
        # defeated by the modifications to the sumpy helper function library. -Eric Huber
        s = 'Your answer contains the floating-point number ' + str(err.n) + '. '
        s += 'All numbers must be expressed as integers (or ratios of integers). '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        minidata['format_errors'] = s
        minidata['submitted_answers'] = None
        return False
    except phs.HasComplexError as err:
        s = 'Your answer contains the complex number ' + str(err.n) + '. '
        if not allow_float:
            s += 'All numbers must be expressed as integers (or ratios of integers). '
        if allow_complex:
            if allow_float:
                s += 'To include a complex number in your expression, write it as the product of an integer or floating-point number with the imaginary unit <code>i</code> or <code>j</code>. '
            else:
                s += 'To include a complex number in your expression, write it as the product of an integer with the imaginary unit <code>i</code> or <code>j</code>. '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        minidata['format_errors'] = s
        minidata['submitted_answers'] = None
        return False
    except phs.HasInvalidExpressionError as err:
        s = 'Your answer has an invalid expression. '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        minidata['format_errors'] = s
        minidata['submitted_answers'] = None
        return False
    except phs.HasInvalidFunctionError as err:
        s = 'Your answer calls an invalid function "' + err.text + '". '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        minidata['format_errors'] = s
        minidata['submitted_answers'] = None
        return False
    except phs.HasInvalidVariableError as err:
        s = 'Your answer refers to an invalid variable "' + err.text + '". '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        minidata['format_errors'] = s
        minidata['submitted_answers'] = None
        return False
    except phs.HasParseError as err:
        s = 'Your answer has a syntax error. '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        minidata['format_errors'] = s
        minidata['submitted_answers'] = None
        return False
    except phs.HasEscapeError as err:
        s = 'Your answer must not contain the character "\\". '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        minidata['format_errors'] = s
        minidata['submitted_answers'] = None
        return False
    except phs.HasCommentError as err:
        s = 'Your answer must not contain the character "#". '
        s += '<br><br><pre>' + phs.point_to_error(a_sub, err.offset) + '</pre>'
        minidata['format_errors'] = s
        minidata['submitted_answers'] = None
        return False
    except Exception as e:
        minidata['format_errors'] = 'Invalid format: ' + str(e)
        minidata['submitted_answers'] = None
        return False

    # Make sure we can parse the json again
    try:
        # Convert safely to sympy
        phs.json_to_sympy(a_sub_json, allow_complex=allow_complex)

        # Finally, store the result
        minidata['format_errors'] = ''
        minidata['submitted_answers'] = a_sub_json
        return True
    except Exception:
        s = 'Your answer was simplified to this, which contains an invalid expression: $${:s}$$'.format(sympy.latex(a_sub_parsed))
        minidata['format_errors'] = s
        minidata['submitted_answers'] = None
        return False

def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    variables = get_variables_list(pl.get_string_attrib(element, 'variables', VARIABLES_DEFAULT))
    allow_complex = pl.get_boolean_attrib(element, 'allow-complex', ALLOW_COMPLEX_DEFAULT)
    imaginary_unit = pl.get_string_attrib(element, 'imaginary-unit-for-display', IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT)

    # Get true answer
    a_tru = phs.from_json(data['correct_answers'].get(name, None))
    if a_tru is None:
        return
    ensure_sympy_matrix(a_tru)

    m, n = a_tru.shape
    A = sympy.zeros(m,n)

    minidata = {}
    minidata['variables'] = variables
    minidata['allow_complex'] = allow_complex
    minidata['imaginary_unit'] = imaginary_unit

    # Create an array for the submitted answer to be stored in data['submitted_answer'][name]
    # used for display in the answer and submission panels
    # Also creates invalid error messages
    invalid_format = False
    invalid_format_extra_str = ''
    for i in range(m):
        for j in range(n):
            each_entry_name = name + '_' + str(n * i + j + 1)
            # Get the a_sub (still in raw string format)
            a_sub = data['submitted_answers'].get(each_entry_name, None)
            if a_sub is None:
                data['submitted_answers'][each_entry_name] = None
                data['format_errors'][each_entry_name] = '(No submitted answer)'
                invalid_format_extra_str += '<br><br> Error: (No submitted answer)'
                invalid_format = True
            elif not a_sub:
                data['submitted_answers'][each_entry_name] = None
                data['format_errors'][each_entry_name] = '(Invalid blank entry)'
                invalid_format_extra_str += '<br><br> Error: (Invalid blank entry)'
                invalid_format = True
            else:
                # parse a_sub (string) to one SymPy element
                parse_success = parse_sympy_single(a_sub, minidata)
                if (not parse_success) or (minidata['submitted_answers'] is None):
                    invalid_format = True
                    data['format_errors'][each_entry_name] = minidata['format_errors']
                    invalid_format_extra_str += '<br><br> Error: ' + data['format_errors'][each_entry_name]
                else:
                    A[i,j] = phs.json_to_sympy(minidata['submitted_answers'], allow_complex)
                    # A[i,j] = A[i,j].subs(sympy.I, sympy.Symbol(imaginary_unit))
                    A = sympy_resub_symbols(A, allow_complex)
                data['submitted_answers'][each_entry_name] = minidata['submitted_answers']

    if invalid_format:
        data['format_errors'][name] = 'At least one of the entries has invalid format.' + invalid_format_extra_str
        data['submitted_answers'][name] = None
    else:
        data['submitted_answers'][name] = phs.to_json(A) # pl.to_json(A)


def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    allow_partial_credit = pl.get_boolean_attrib(element, 'allow-partial-credit', ALLOW_PARTIAL_CREDIT_DEFAULT)

    # Get weight
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)

    # Get method of comparison, with relabs as default
    comparison = pl.get_string_attrib(element, 'comparison', COMPARISON_DEFAULT)
    if comparison == 'relabs':
        rtol = pl.get_float_attrib(element, 'rtol', RTOL_DEFAULT)
        atol = pl.get_float_attrib(element, 'atol', ATOL_DEFAULT)
    elif comparison == 'sigfig':
        digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
        raise ValueError('method of comparison "%s" is not implemented for this component type currently' % comparison)
    elif comparison == 'decdig':
        digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
        raise ValueError('method of comparison "%s" is not implemented for this component type currently' % comparison)
    else:
        raise ValueError('method of comparison "%s" is not valid' % comparison)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = phs.from_json(data['correct_answers'].get(name, None))
    if a_tru is None:
        return
    # Throw an error if true answer is not a 2D SymPy Matrix
    ensure_sympy_matrix(a_tru)

    m, n = a_tru.shape

    number_of_correct = 0
    feedback = {}
    for i in range(m):
        for j in range(n):

            each_entry_name = name + '_' + str(n * i + j + 1)
            a_sub = data['submitted_answers'].get(each_entry_name, None)
            # Get submitted answer (if it does not exist, score is zero)
            if a_sub is None:
                data['partial_scores'][name] = {'score': 0, 'weight': weight}
                return
            # If submitted answer is in a format generated by pl.to_json, convert it
            # back to a standard type (otherwise, do nothing)
            a_sub = phs.from_json(a_sub)

            # initialize as not correct
            correct = False

            # First, see if it's exactly the same symbolically (easy)
            try:
                correct = (a_sub == a_tru[i,j])
            except Exception:
                correct = False

            # Second chance: see if the polynomial coefficients are approximately the same
            if not correct:
                # Approximate comparison of coefficients
                # if comparison == 'relabs':
                #     correct = pl.is_correct_scalar_ra(a_sub, a_tru[i, j], rtol, atol)
                # elif comparison == 'sigfig':
                #     correct = pl.is_correct_scalar_sf(a_sub, a_tru[i, j], digits)
                # elif comparison == 'decdig':
                #     correct = pl.is_correct_scalar_dd(a_sub, a_tru[i, j], digits)
                if comparison == 'relabs':
                    correct = sympy_poly_coeffs_compare_atol(a_sub, a_tru[i,j], atol)

            if correct:
                number_of_correct += 1
                feedback.update({each_entry_name: 'correct'})
            else:
                feedback.update({each_entry_name: 'incorrect'})

    if number_of_correct == m * n:
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    else:
        if not allow_partial_credit:
            score_value = 0
        else:
            score_value = number_of_correct / (m * n)
        data['partial_scores'][name] = {'score': score_value, 'weight': weight, 'feedback': feedback}


def test(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)
    allow_partial_credit = pl.get_boolean_attrib(element, 'allow-partial-credit', ALLOW_PARTIAL_CREDIT_DEFAULT)

    # Get correct answer
    a_tru = data['correct_answers'][name]
    # If correct answer is in a format generated by pl.to_json, convert it
    # back to a standard type (otherwise, do nothing)
    a_tru = phs.from_json(a_tru)
    ensure_sympy_matrix(a_tru)
    m, n = a_tru.shape

    result = random.choices(['correct', 'incorrect', 'incorrect'], [5, 5, 1])[0]

    number_of_correct = 0
    feedback = {}
    for i in range(m):
        for j in range(n):
            each_entry_name = name + '_' + str(n * i + j + 1)

            if result == 'correct':
                data['raw_submitted_answers'][each_entry_name] = str(a_tru[i, j])
                number_of_correct += 1
                feedback.update({each_entry_name: 'correct'})
            elif result == 'incorrect':
                data['raw_submitted_answers'][each_entry_name] = str(a_tru[i, j] + (random.uniform(1, 10) * random.choice([-1, 1])))
                feedback.update({each_entry_name: 'incorrect'})
            elif result == 'invalid':
                if random.choice([True, False]):
                    data['raw_submitted_answers'][each_entry_name] = '1,2'
                    data['format_errors'][each_entry_name] = '(Invalid format)'
                else:
                    data['raw_submitted_answers'][name] = ''
                    data['format_errors'][each_entry_name] = '(Invalid blank entry)'
            else:
                raise Exception('invalid result: %s' % result)

    if result == 'invalid':
        data['format_errors'][name] = 'At least one of the entries has invalid format'

    if number_of_correct == m * n:
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    else:
        if not allow_partial_credit:
            score_value = 0
        else:
            score_value = number_of_correct / (m * n)
        data['partial_scores'][name] = {'score': score_value, 'weight': weight, 'feedback': feedback}


def createTableForHTMLDisplay(m, n, name, label, data, format):

    editable = data['editable']

    if format == 'output-invalid':

        display_array = '<table>'
        display_array += '<tr>'
        display_array += '<td class="close-left" rowspan="' + str(m) + '"></td>'
        display_array += '<td style="width:4px" rowspan="' + str(m) + '"></td>'
        # First row of array
        for j in range(n):
            each_entry_name = name + '_' + str(j + 1)
            raw_submitted_answer = data['raw_submitted_answers'].get(each_entry_name, None)
            format_errors = data['format_errors'].get(each_entry_name, None)
            if format_errors is None:
                display_array += ' <td class="allborder"> '
            else:
                display_array += ' <td class="allborder" bgcolor="#FFFF00"> '
            display_array += escape(raw_submitted_answer)
            display_array += ' </td> '
        display_array += '<td style="width:4px" rowspan="' + str(m) + '"></td>'
        display_array += '<td class="close-right" rowspan="' + str(m) + '"></td>'
        # Add the other rows
        for i in range(1, m):
            display_array += ' <tr>'
            for j in range(n):
                each_entry_name = name + '_' + str(n * i + j + 1)
                raw_submitted_answer = data['raw_submitted_answers'].get(each_entry_name, None)
                format_errors = data['format_errors'].get(each_entry_name, None)
                if format_errors is None:
                    display_array += ' <td class="allborder"> '
                else:
                    display_array += ' <td class="allborder" bgcolor="#FFFF00"> '
                display_array += escape(raw_submitted_answer)
                display_array += ' </td> '
            display_array += '</tr>'
        display_array += '</table>'

    elif format == 'output-feedback':

        partial_score_feedback = data['partial_scores'].get(name, {'feedback': None})
        feedback_each_entry = partial_score_feedback.get('feedback', None)
        score = partial_score_feedback.get('score', None)

        if score is not None:
            score = float(score)
            if score >= 1:
                score_message = '&nbsp;<span class="badge badge-success"><i class="fa fa-check" aria-hidden="true"></i> 100%</span>'
            elif score > 0:
                score_message = '&nbsp;<span class="badge badge-warning"><i class="far fa-circle" aria-hidden="true"></i>' + str(math.floor(score * 100)) + '%</span>'
            else:
                score_message = '&nbsp;<span class="badge badge-danger"><i class="fa fa-times" aria-hidden="true"></i> 0%</span>'
        else:
            score_message = ''

        display_array = '<table>'
        display_array += '<tr>'
        # Add the prefix
        if label is not None:
            display_array += '<td rowspan="0">' + label + '&nbsp;</td>'
        display_array += '<td class="close-left" rowspan="' + str(m) + '"></td>'
        display_array += '<td style="width:4px" rowspan="' + str(m) + '"></td>'
        # First row of array
        for j in range(n):
            each_entry_name = name + '_' + str(j + 1)
            raw_submitted_answer = data['raw_submitted_answers'].get(each_entry_name, None)
            display_array += '<td class="allborder">'
            display_array += escape(raw_submitted_answer)
            if feedback_each_entry is not None:
                if feedback_each_entry[each_entry_name] == 'correct':
                    feedback_message = '&nbsp;<span class="badge badge-success"><i class="fa fa-check" aria-hidden="true"></i></span>'
                elif feedback_each_entry[each_entry_name] == 'incorrect':
                    feedback_message = '&nbsp;<span class="badge badge-danger"><i class="fa fa-times" aria-hidden="true"></i></span>'
                display_array += feedback_message
            display_array += '</td> '
        # Add the suffix
        display_array += '<td style="width:4px" rowspan="' + str(m) + '"></td>'
        display_array += '<td class="close-right" rowspan="' + str(m) + '"></td>'
        if score_message is not None:
            display_array += '<td rowspan="0">&nbsp;' + score_message + '</td>'
        display_array += '</tr>'
        # Add the other rows
        for i in range(1, m):
            display_array += ' <tr>'
            for j in range(n):
                each_entry_name = name + '_' + str(n * i + j + 1)
                raw_submitted_answer = data['raw_submitted_answers'].get(each_entry_name, None)
                display_array += ' <td class="allborder"> '
                display_array += escape(raw_submitted_answer)
                if feedback_each_entry is not None:
                    if feedback_each_entry[each_entry_name] == 'correct':
                        feedback_message = '&nbsp;<span class="badge badge-success"><i class="fa fa-check" aria-hidden="true"></i></span>'
                    elif feedback_each_entry[each_entry_name] == 'incorrect':
                        feedback_message = '&nbsp;<span class="badge badge-danger"><i class="fa fa-times" aria-hidden="true"></i></span>'
                    display_array += feedback_message
                display_array += ' </td> '
            display_array += '</tr>'
        display_array += '</table>'

    elif format == 'input':
        display_array = '<table>'
        display_array += '<tr>'
        # Add first row
        display_array += '<td class="close-left" rowspan="' + str(m) + '"></td>'
        display_array += '<td style="width:4px" rowspan="' + str(m) + '"></td>'
        for j in range(n):
            each_entry_name = name + '_' + str(j + 1)
            raw_submitted_answer = data['raw_submitted_answers'].get(each_entry_name, None)
            display_array += ' <td> <input name= "' + each_entry_name + '" type="text" size="8"  '
            if not editable:
                display_array += ' disabled '
            if raw_submitted_answer is not None:
                display_array += '  value= "'
                display_array += escape(raw_submitted_answer)
            display_array += '" /> </td>'
        display_array += '<td style="width:4px" rowspan="' + str(m) + '"></td>'
        display_array += '<td class="close-right" rowspan="' + str(m) + '"></td>'
        # Add other rows
        for i in range(1, m):
            display_array += ' <tr>'
            for j in range(n):
                each_entry_name = name + '_' + str(n * i + j + 1)
                raw_submitted_answer = data['raw_submitted_answers'].get(each_entry_name, None)
                display_array += ' <td> <input name= "' + each_entry_name + '" type="text" size="8"  '
                if not editable:
                    display_array += ' disabled '
                if raw_submitted_answer is not None:
                    display_array += '  value= "'
                    display_array += escape(raw_submitted_answer)
                display_array += '" /> </td>'
                display_array += ' </td> '
            display_array += '</tr>'
        display_array += '</table>'

    else:

        display_array = ''

    return display_array
