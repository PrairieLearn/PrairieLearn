import lxml.html
import to_precision
import numpy as np
import uuid
import sympy
from python_helper_sympy import convert_string_to_sympy
from python_helper_sympy import sympy_to_json
from python_helper_sympy import json_to_sympy
import re


def to_json(v):
    """to_json(v)

    If v has a standard type that cannot be json serialized, it is replaced with
    a {'_type':..., '_value':...} pair that can be json serialized:

        complex -> '_type': 'complex'
        non-complex ndarray (assumes each element can be json serialized) -> '_type': 'ndarray'
        complex ndarray -> '_type': 'complex_ndarray'
        sympy.Expr (i.e., any scalar sympy expression) -> '_type': 'sympy'
        sympy.Matrix -> '_type': 'sympy_matrix'

    If v is an ndarray, this function preserves its dtype (by adding '_dtype' as
    a third field in the dictionary).

    This function does not try to preserve information like the assumptions on
    variables in a sympy expression.

    If v can be json serialized or does not have a standard type, then it is
    returned without change.
    """
    if np.isscalar(v) and np.iscomplexobj(v):
        return {'_type': 'complex', '_value': {'real': v.real, 'imag': v.imag}}
    elif isinstance(v, np.ndarray):
        if np.isrealobj(v):
            return {'_type': 'ndarray', '_value': v.tolist(), '_dtype': str(v.dtype)}
        elif np.iscomplexobj(v):
            return {'_type': 'complex_ndarray', '_value': {'real': v.real.tolist(), 'imag': v.imag.tolist()}, '_dtype': str(v.dtype)}
    elif isinstance(v, sympy.Expr):
        return sympy_to_json(v)
    elif isinstance(v, sympy.Matrix) or isinstance(v, sympy.ImmutableMatrix):
        s = [str(a) for a in v.free_symbols]
        num_rows, num_cols = v.shape
        M = []
        for i in range(0, num_rows):
            row = []
            for j in range(0, num_cols):
                row.append(str(v[i, j]))
            M.append(row)
        return {'_type': 'sympy_matrix', '_value': M, '_variables': s, '_shape': [num_rows, num_cols]}
    else:
        return v


def from_json(v):
    """from_json(v)

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
                return json_to_sympy(v)
            elif v['_type'] == 'sympy_matrix':
                if ('_value' in v) and ('_variables' in v) and ('_shape' in v):
                    value = v['_value']
                    variables = v['_variables']
                    shape = v['_shape']
                    M = sympy.Matrix.zeros(shape[0], shape[1])
                    for i in range(0, shape[0]):
                        for j in range(0, shape[1]):
                            M[i, j] = convert_string_to_sympy(value[i][j], variables)
                    return M
                else:
                    raise Exception('variable of type sympy_matrix should have value, variables, and shape')
            else:
                raise Exception('variable has unknown type {:s}'.format(v['_type']))
    return v


def inner_html(element):
    html = element.text
    if html is None:
        html = ''
    html = str(html)
    for child in element:
        html += lxml.html.tostring(child, method='html', pretty_print=True).decode('utf-8')
    return html


def compat_get(object, attrib, default):
    if attrib in object:
        return object[attrib]
    old_attrib = attrib.replace('-', '_')
    return old_attrib in object


def compat_array(arr):
    new_arr = []
    for i in arr:
        new_arr.append(i)
        new_arr.append(i.replace('-', '_'))
    return new_arr


def check_attribs(element, required_attribs, optional_attribs):
    for name in required_attribs:
        if not has_attrib(element, name):
            raise Exception('Required attribute "%s" missing' % name)
    extra_attribs = list(set(element.attrib) - set(compat_array(required_attribs)) - set(compat_array(optional_attribs)))
    for name in extra_attribs:
        raise Exception('Unknown attribute "%s"' % name)


def _get_attrib(element, name, *args):
    """(value, is_default) = _get_attrib(element, name, default)

    Internal function, do not all. Use one of the typed variants
    instead (e.g., get_string_attrib()).

    Returns the named attribute for the element, or the default value
    if the attribute is missing.  The default value is optional. If no
    default value is provided and the attribute is missing then an
    exception is thrown. The second return value indicates whether the
    default value was returned.
    """
    # It seems like we could use keyword arguments with a default
    # value to handle the "default" argument, but we want to be able
    # to distinguish between default=None and no default being passed,
    # which means we need to explicitly handle the optional argument
    if len(args) > 1:
        raise Exception('Only one additional argument is allowed')

    if name in element.attrib:
        return (element.attrib[name], False)

    # We need to check for the legacy _ version
    old_name = name.replace('-', '_')
    if old_name in element.attrib:
        return (element.attrib[old_name], False)

    # Provide a default if we can
    if len(args) == 1:
        return (args[0], True)

    raise Exception('Attribute "%s" missing and no default is available' % name)


def has_attrib(element, name):
    """value = has_attrib(element, name)

    Returns true if the element has an attribute of that name,
    false otherwise.
    """
    old_name = name.replace('-', '_')
    return name in element.attrib or old_name in element.attrib


def get_string_attrib(element, name, *args):
    """value = get_string_attrib(element, name, default)

    Returns the named attribute for the element, or the (optional)
    default value. If the default value is not provided and the
    attribute is missing then an exception is thrown.
    """
    (str_val, is_default) = _get_attrib(element, name, *args)
    return str_val


def get_boolean_attrib(element, name, *args):
    """value = get_boolean_attrib(element, name, default)

    Returns the named attribute for the element, or the (optional)
    default value. If the default value is not provided and the
    attribute is missing then an exception is thrown. If the attribute
    is not a valid boolean then an exception is thrown.
    """
    (val, is_default) = _get_attrib(element, name, *args)
    if is_default:
        return val

    true_values = ['true', 't', '1', 'True', 'T', 'TRUE', 'yes', 'y', 'Yes', 'Y', 'YES']
    false_values = ['false', 'f', '0', 'False', 'F', 'FALSE', 'no', 'n', 'No', 'N', 'NO']

    if val in true_values:
        return True
    elif val in false_values:
        return False
    else:
        raise Exception('Attribute "%s" must be a boolean value: %s' % (name, val))


def get_integer_attrib(element, name, *args):
    """value = get_integer_attrib(element, name, default)

    Returns the named attribute for the element, or the (optional)
    default value. If the default value is not provided and the
    attribute is missing then an exception is thrown. If the attribute
    is not a valid integer then an exception is thrown.
    """
    (val, is_default) = _get_attrib(element, name, *args)
    if is_default:
        return val
    try:
        int_val = int(val)
    except ValueError:
        int_val = None
    if int_val is None:
        # can't raise this exception directly in the above except
        # handler because it gives an overly complex displayed error
        raise Exception('Attribute "%s" must be an integer: %s' % (name, val))
    return int_val


def get_float_attrib(element, name, *args):
    """value = get_float_attrib(element, name, default)

    Returns the named attribute for the element, or the (optional)
    default value. If the default value is not provided and the
    attribute is missing then an exception is thrown. If the attribute
    is not a valid floating-point number then an exception is thrown.
    """
    (val, is_default) = _get_attrib(element, name, *args)
    if is_default:
        return val
    try:
        float_val = float(val)
    except ValueError:
        float_val = None
    if float_val is None:
        # can't raise this exception directly in the above except
        # handler because it gives an overly complex displayed error
        raise Exception('Attribute "%s" must be a number: %s' % (name, val))
    return float_val


def get_color_attrib(element, name, *args):
    """value = get_color_attrib(element, name, default)

    Returns a 3-digit or 6-digit hex RGB string in CSS format (e.g., '#123'
    or '#1a2b3c'), or the (optional) default value. If the default value is
    not provided and the attribute is missing then an exception is thrown. If
    the attribute is not a valid RGB string then an exception is thrown.
    """
    (val, is_default) = _get_attrib(element, name, *args)
    if is_default:
        return val
    match = re.search(r'^#(?:[0-9a-fA-F]{1,2}){3}$', val)
    if match:
        return val
    else:
        raise Exception('Attribute "{:s}" must be a CSS-style RGB string: {:s}'.format(name, val))


def numpy_to_matlab(A, ndigits=2, wtype='f'):
    """numpy_to_matlab(A, ndigits=2, wtype='f')

    This function assumes that A is one of these things:

        - a number (float or complex)
        - a 2D ndarray (float or complex)

    It returns A as a MATLAB-formatted string in which each number has "ndigits"
    digits after the decimal and is formatted as "wtype" (e.g., 'f', 'g', etc.).
    """
    if np.isscalar(A):
        A_str = '{:.{indigits}{iwtype}}'.format(A, indigits=ndigits, iwtype=wtype)
        return A_str
    else:
        s = A.shape
        m = s[0]
        n = s[1]
        A_str = '['
        for i in range(0, m):
            for j in range(0, n):
                A_str += '{:.{indigits}{iwtype}}'.format(A[i, j], indigits=ndigits, iwtype=wtype)
                if j == n - 1:
                    if i == m - 1:
                        A_str += ']'
                    else:
                        A_str += '; '
                else:
                    A_str += ' '
        return A_str


def string_from_2darray(A, language='python', presentation_type='f', digits=2):
    """string_from_2darray(A)

    This function assumes that A is one of these things:

        - a number (float or complex)
        - a 2D ndarray (float or complex)

    It returns A as a string.

    If language is 'python' and A is a 2D ndarray, the string looks like this:

        [[ ..., ... ], [ ..., ... ]]

    If language is 'matlab' and A is a 2D ndarray, the string looks like this:

        [ ... ... ; ... ... ]

    In either case, if A is not a 2D ndarray, the string is a single number,
    not wrapped in brackets.

    If presentation_type is 'sigfig', each number is formatted using the
    to_precision module to "digits" significant figures.

    Otherwise, each number is formatted as '{:.{digits}{presentation_type}}'.
    """

    # if A is a scalar
    if np.isscalar(A):
        if presentation_type == 'sigfig':
            return string_from_number_sigfig(A, digits=digits)
        else:
            return '{:.{digits}{presentation_type}}'.format(A, digits=digits, presentation_type=presentation_type)

    # if A is a 2D ndarray
    if language == 'python':
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
        return np.array2string(A, formatter=formatter, separator=', ').replace('\n', '')
    elif language == 'matlab':
        if presentation_type == 'sigfig':
            return numpy_to_matlab_sf(A, ndigits=digits)
        else:
            return numpy_to_matlab(A, ndigits=digits, wtype=presentation_type)
    else:
        raise Exception('language "{:s}" must be either "python" or "matlab"'.format(language))


def string_from_number_sigfig(a, digits=2):
    """_string_from_complex_sigfig(a, digits=2)

    This function assumes that "a" is of type float or complex. It returns "a"
    as a string in which the number, or both the real and imaginary parts of the
    number, have digits significant digits.
    """
    if np.iscomplexobj(a):
        return _string_from_complex_sigfig(a, digits=digits)
    else:
        return to_precision.to_precision(a, digits)


def _string_from_complex_sigfig(a, digits=2):
    """_string_from_complex_sigfig(a, digits=2)

    This function assumes that "a" is a complex number. It returns "a" as a string
    in which the real and imaginary parts have digits significant digits.
    """
    re = to_precision.to_precision(a.real, digits)
    im = to_precision.to_precision(np.abs(a.imag), digits)
    if a.imag >= 0:
        return '{:s}+{:s}j'.format(re, im)
    elif a.imag < 0:
        return '{:s}-{:s}j'.format(re, im)


def numpy_to_matlab_sf(A, ndigits=2):
    """numpy_to_matlab(A, ndigits=2)

    This function assumes that A is one of these things:

        - a number (float or complex)
        - a 2D ndarray (float or complex)

    It returns A as a MATLAB-formatted string in which each number has
    ndigits significant digits.
    """
    if np.isscalar(A):
        if np.iscomplexobj(A):
            A_str = _string_from_complex_sigfig(A, ndigits)
        else:
            A_str = to_precision.to_precision(A, ndigits)
        return A_str
    else:
        s = A.shape
        m = s[0]
        n = s[1]
        A_str = '['
        for i in range(0, m):
            for j in range(0, n):
                if np.iscomplexobj(A[i, j]):
                    A_str += _string_from_complex_sigfig(A[i, j], ndigits)
                else:
                    A_str += to_precision.to_precision(A[i, j], ndigits)
                if j == n - 1:
                    if i == m - 1:
                        A_str += ']'
                    else:
                        A_str += '; '
                else:
                    A_str += ' '
        return A_str


# This function assumes that A is either a floating-point number or a
# real-valued numpy array. It returns A as a python-formatted string
# in which each entry has ndigits significant digits.
def string_from_2darray_sf(A, ndigits=2):
    if np.isscalar(A):
        A_str = to_precision.to_precision(A, ndigits)
        return A_str
    else:
        s = A.shape
        m = s[0]
        n = s[1]
        A_str = ''
        for i in range(0, m):
            row = ''
            for j in range(0, n):
                row += to_precision.to_precision(A[i, j], ndigits)
                if j != n - 1:
                    row += ', '
            A_str += '[' + row + ']'
            if i != m - 1:
                A_str += ', '
        A_str = '[' + A_str + ']'
        return A_str


def string_partition_first_interval(s, left='[', right=']'):
    # Split at first left delimiter
    (s_before_left, s_left, s) = s.partition(left)
    # Split at first right delimiter
    (s, s_right, s_after_right) = s.partition(right)
    # Return results
    return s_before_left, s, s_after_right


def string_partition_outer_interval(s, left='[', right=']'):
    # Split at first left delimiter
    (s_before_left, s_left, s) = s.partition(left)
    # Split at last right delimiter
    (s, s_right, s_after_right) = s.rpartition(right)
    # Return results
    return s_before_left, s, s_after_right


def string_to_integer(s):
    """string_to_integer(s)

    Parses a string that is an integer.

    Returns a number with type int, or None on parse error.
    """
    # Replace unicode minus with hyphen minus wherever it occurs
    s = s.replace(u'\u2212', '-').strip()
    # Check if it is an integer, i.e., if it contains only digits and possibly
    # hypen minus as the first character
    if not (s.isdigit() or s[1:].isdigit()):
        return None
    # Try to parse as int
    try:
        s_int = int(s)
        return s_int
    except Exception:
        # If that didn't work, return None
        return None


def string_to_number(s, allow_complex=True):
    """string_to_number(s, allow_complex=True)

    Parses a string that can be interpreted either as float or (optionally) complex.

    Returns a number with type np.float64 or np.complex128, or None on parse error.
    """
    # Replace unicode minus with hyphen minus wherever it occurs
    s = s.replace(u'\u2212', '-')
    # If complex numbers are allowed...
    if allow_complex:
        # Replace "i" with "j" wherever it occurs
        s = s.replace('i', 'j')
        # Strip white space on either side of "+" or "-" wherever they occur
        s = re.sub(r' *\+ *', '+', s)
        s = re.sub(r' *\- *', '-', s)
    # Try to parse as float
    try:
        s_float = float(s)
        return np.float64(s_float)
    except Exception:
        # If that didn't work, either pass (and try to parse as complex) or return None
        if allow_complex:
            pass
        else:
            return None
    # Try to parse as complex
    try:
        s_complex = complex(s)
        return np.complex128(s_complex)
    except Exception:
        # If that didn't work, return None
        return None


def string_to_2darray(s, allow_complex=True):
    """string_to_2darray(s)

    Parses a string that is either a scalar or a 2D array in matlab or python
    format. Each number must be interpretable as type float or complex.
    """
    # Replace unicode minus with hyphen minus wherever it occurs
    s = s.replace(u'\u2212', '-')
    # If complex numbers are allowed...
    if allow_complex:
        # Replace "i" with "j" wherever it occurs
        s = s.replace('i', 'j')

    # Count left and right brackets and check that they are balanced
    number_of_left_brackets = s.count('[')
    number_of_right_brackets = s.count(']')
    if number_of_left_brackets != number_of_right_brackets:
        return (None, {'format_error': 'Unbalanced square brackets.'})

    # If there are no brackets, treat as scalar
    if number_of_left_brackets == 0:
        try:
            # Convert submitted answer (assumed to be a scalar) to float or (optionally) complex
            ans = string_to_number(s, allow_complex=allow_complex)
            if ans is None:
                raise ValueError('invalid submitted answer (wrong type)')
            if not np.isfinite(ans):
                raise ValueError('invalid submitted answer (not finite)')
            A = np.array([[ans]])
            # Return it with no error
            return (A, {'format_type': 'python'})
        except Exception:
            # Return error if submitted answer could not be converted to float or complex
            if allow_complex:
                return (None, {'format_error': 'Invalid format (missing square brackets and could not be interpreted as a double-precision floating-point number or as a double-precision complex number).'})
            else:
                return (None, {'format_error': 'Invalid format (missing square brackets and could not be interpreted as a double-precision floating-point number).'})

    # Get string between outer brackets
    (s_before_left, s, s_after_right) = string_partition_outer_interval(s)

    # Return error if there is anything but space outside brackets
    s_before_left = s_before_left.strip()
    s_after_right = s_after_right.strip()
    if s_before_left:
        return (None, {'format_error': 'Non-empty text "{:s}" before outer brackets.'.format(s_before_left)})
    if s_after_right:
        return (None, {'format_error': 'Non-empty space "{:s}" after outer brackets.'.format(s_after_right)})

    # If there is only one set of brackets, treat as MATLAB format
    if number_of_left_brackets == 1:
        # Can NOT strip white space on either side of "+" or "-" wherever they occur,
        # because there is an ambiguity between space delimiters and whitespace.
        #
        #   Example:
        #       is '[1 - 2j]' the same as '[1 -2j]' or '[1-2j]'

        # Return error if there are any commas
        if ',' in s:
            return (None, {'format_error': 'Commas cannot be used as delimiters in an expression with single brackets.'})

        # Split on semicolon
        s = s.split(';')

        # Get number of rows
        m = len(s)

        # Return error if there are no rows (i.e., the matrix is empty)
        if (m == 0):
            return (None, {'format_error': 'Matrix has no rows.'})

        # Get number of columns by splitting first row on space
        n = len(s[0].split())

        # Return error if first row has no columns
        if (n == 0):
            return (None, {'format_error': 'First row of matrix has no columns.'})

        # Define matrix in which to put result
        A = np.zeros((m, n))

        # Iterate over rows
        for i in range(0, m):

            # Split on space
            s_row = s[i].split()

            # Return error if current row has more or less columns than first row
            if (len(s_row) != n):
                return (None, {'format_error': 'Rows 1 and {:d} of matrix have a different number of columns.'.format(i + 1)})

            # Iterate over columns
            for j in range(0, n):
                try:
                    # Convert entry to float or (optionally) complex
                    ans = string_to_number(s_row[j], allow_complex=allow_complex)
                    if ans is None:
                        raise ValueError('invalid submitted answer (wrong type)')

                    # Return error if entry is not finite
                    if not np.isfinite(ans):
                        raise ValueError('invalid submitted answer (not finite)')

                    # If the new entry is complex, convert the entire array in-place to np.complex128
                    if np.iscomplexobj(ans):
                        A = A.astype(np.complex128, copy=False)

                    # Insert the new entry
                    A[i, j] = ans
                except Exception:
                    # Return error if entry could not be converted to float or complex
                    return (None, {'format_error': 'Entry ({:d}, {:d}) of matrix "{:s}" has invalid format.'.format(i + 1, j + 1, s_row[j])})

        # Return resulting ndarray with no error
        return (A, {'format_type': 'matlab'})

    # If there is more than one set of brackets, treat as python format
    if number_of_left_brackets > 1:
        # Strip white space on either side of "+" or "-" wherever they occur
        s = re.sub(r' *\+ *', '+', s)
        s = re.sub(r' *\- *', '-', s)

        # Return error if there are any semicolons
        if ';' in s:
            return (None, {'format_error': 'Semicolons cannot be used as delimiters in an expression with nested brackets.'})

        # Partition string into rows
        s_row = []
        while s:
            # Get next row
            (s_before_left, s_between_left_and_right, s_after_right) = string_partition_first_interval(s)
            s_before_left = s_before_left.strip()
            s_after_right = s_after_right.strip()
            s_between_left_and_right = s_between_left_and_right.strip()
            s_row.append(s_between_left_and_right)

            # Return error if there is anything but space before left bracket
            if s_before_left:
                return (None, {'format_error': 'Non-empty text "{:s}" before left bracket in row {:d} of matrix.'.format(s_before_left, len(s_row))})

            # Return error if there are improperly nested brackets
            if ('[' in s_between_left_and_right) or (']' in s_between_left_and_right):
                return (None, {'format_error': 'Improperly nested brackets in row {:d} of matrix.'.format(len(s_row))})

            # Check if we are in the last row
            if (len(s_row) == number_of_left_brackets - 1):
                # Return error if it is the last row and there is anything but space after right bracket
                if s_after_right:
                    return (None, {'format_error': 'Non-empty text "{:s}" after right bracket in row {:d} of matrix.'.format(s_after_right, len(s_row))})
                else:
                    s = s_after_right
            else:
                # Return error if it is not the last row and there is no comma after right bracket
                if s_after_right[0] != ',':
                    return (None, {'format_error': 'No comma after row {:d} of matrix.'.format(len(s_row))})
                else:
                    s = s_after_right[1:]
        number_of_rows = len(s_row)

        # Check that number of rows is what we expected
        if number_of_rows != number_of_left_brackets - 1:
            raise Exception('Number of rows {:d} should have been one less than the number of brackets {:d}'.format(number_of_rows, number_of_left_brackets))

        # Split each row on comma
        number_of_columns = None
        for i in range(0, number_of_rows):
            # Return error if row has no columns
            if not s_row[i]:
                return (None, {'format_error': 'Row {:d} of matrix has no columns.'.format(i + 1)})

            # Splitting on a comma always returns a list with at least one element
            s_row[i] = s_row[i].split(',')
            n = len(s_row[i])

            # Return error if row has different number of columns than first row
            if number_of_columns is None:
                number_of_columns = n
            elif number_of_columns != n:
                return (None, {'format_error': 'Rows 1 and {:d} of matrix have a different number of columns.'.format(i + 1)})

        # Define matrix in which to put result
        A = np.zeros((number_of_rows, number_of_columns))

        # Parse each row and column
        for i in range(0, number_of_rows):
            for j in range(0, number_of_columns):
                try:
                    # Check if entry is empty
                    if not s_row[i][j].strip():
                        return (None, {'format_error': 'Entry ({:d}, {:d}) of matrix is empty.'.format(i + 1, j + 1)})

                    # Convert entry to float or (optionally) complex
                    ans = string_to_number(s_row[i][j], allow_complex=allow_complex)
                    if ans is None:
                        raise ValueError('invalid submitted answer (wrong type)')

                    # Return error if entry is not finite
                    if not np.isfinite(ans):
                        raise ValueError('invalid submitted answer (not finite)')

                    # If the new entry is complex, convert the entire array in-place to np.complex128
                    if np.iscomplexobj(ans):
                        A = A.astype(np.complex128, copy=False)

                    # Insert the new entry
                    A[i, j] = ans
                except Exception:
                    # Return error if entry could not be converted to float or complex
                    return (None, {'format_error': 'Entry ({:d}, {:d}) of matrix "{:s}" has invalid format.'.format(i + 1, j + 1, s_row[i][j])})

        # Return result with no error
        return (A, {'format_type': 'python'})

    # Should never get here
    raise Exception('Invalid number of left brackets: {:g}'.format(number_of_left_brackets))


def matlab_to_numpy(a):
    if (('[' in a) and (']' in a)):
        # Split at first left bracket
        (a_before_leftbracket, a_leftbracket, a) = a.partition('[')

        # Return error if there was anything but space before left bracket
        if a_before_leftbracket.strip():
            return (None, 'Non-empty space before first left bracket.')

        # Split at first right bracket
        (a, a_rightbracket, a_after_rightbracket) = a.partition(']')

        # Return error if there was anything but space after right bracket
        if a_after_rightbracket.strip():
            return (None, 'Non-empty space after first right bracket.')

        # Split on semicolon
        a = a.split(';')

        # Get number of rows
        m = len(a)

        # Return error if there are no rows (i.e., the matrix is empty)
        if (m == 0):
            return (None, 'Matrix has no rows.')

        # Get number of columns by splitting first row on space
        n = len(a[0].split())

        # Return error if first row has no columns
        if (n == 0):
            return (None, 'First row of matrix has no columns.')

        # Define matrix in which to put result
        A = np.zeros((m, n))

        # Iterate over rows
        for i in range(0, m):

            # Split on space
            s = a[i].split()

            # Return error if current row has more or less columns than first row
            if (len(s) != n):
                return (None, 'Rows 1 and %d of matrix have a different number of columns.' % (i + 1))

            # Iterate over columns
            for j in range(0, n):
                try:
                    # Convert entry to float
                    A[i, j] = float(s[j])

                    # Return error if entry is not finite
                    if not np.isfinite(A[i, j]):
                        return (None, 'Entry (%d,%d) of matrix is not finite.' % (i + 1, j + 1))
                except Exception:
                    # Return error if entry could not be converted to float
                    return (None, 'Entry (%d,%d) of matrix has invalid format.' % (i + 1, j + 1))

        # Return resulting ndarray with no error
        return (A, None)
    else:
        try:
            # Convert submitted answer (assumed to be a scalar) to float
            A = np.array([[float(a)]])
            # Return it with no error
            return (A, None)
        except Exception:
            # Return error if submitted answer could not be converted to float
            return (None, 'Invalid format (missing square brackets and not a real number).')


def latex_from_2darray(A, presentation_type='f', digits=2):

    """latex_from_2darray
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
    lines = np.array2string(A, formatter=formatter).replace('[', '').replace(']', '').splitlines()
    rv = [r'\begin{bmatrix}']
    rv += ['  ' + ' & '.join(l.split()) + r'\\' for l in lines]
    rv += [r'\end{bmatrix}']
    return ''.join(rv)


def is_correct_ndarray2D_dd(a_sub, a_tru, digits=2):
    # Check if each element is correct
    m = a_sub.shape[0]
    n = a_sub.shape[1]
    for i in range(0, m):
        for j in range(0, n):
            if not is_correct_scalar_dd(a_sub[i, j], a_tru[i, j], digits):
                return False

    # All elements were close
    return True


def is_correct_ndarray2D_sf(a_sub, a_tru, digits=2):
    # Check if each element is correct
    m = a_sub.shape[0]
    n = a_sub.shape[1]
    for i in range(0, m):
        for j in range(0, n):
            if not is_correct_scalar_sf(a_sub[i, j], a_tru[i, j], digits):
                return False

    # All elements were close
    return True


def is_correct_ndarray2D_ra(a_sub, a_tru, rtol=1e-5, atol=1e-8):
    # Check if each element is correct
    return np.allclose(a_sub, a_tru, rtol, atol)


def is_correct_scalar_ra(a_sub, a_tru, rtol=1e-5, atol=1e-8):
    return np.allclose(a_sub, a_tru, rtol, atol)


def is_correct_scalar_dd(a_sub, a_tru, digits=2):
    # If answers are complex, check real and imaginary parts separately
    if np.iscomplexobj(a_sub) or np.iscomplexobj(a_tru):
        return is_correct_scalar_dd(a_sub.real, a_tru.real, digits=digits) and is_correct_scalar_dd(a_sub.imag, a_tru.imag, digits=digits)

    # Get bounds on submitted answer
    eps = 0.51 * (10**-digits)
    lower_bound = a_tru - eps
    upper_bound = a_tru + eps

    # Check if submitted answer is in bounds
    return (a_sub > lower_bound) & (a_sub < upper_bound)


def is_correct_scalar_sf(a_sub, a_tru, digits=2):
    # If answers are complex, check real and imaginary parts separately
    if np.iscomplexobj(a_sub) or np.iscomplexobj(a_tru):
        return is_correct_scalar_sf(a_sub.real, a_tru.real, digits=digits) and is_correct_scalar_sf(a_sub.imag, a_tru.imag, digits=digits)

    # Get bounds on submitted answer
    if (a_tru == 0):
        n = digits - 1
    else:
        n = -int(np.floor(np.log10(np.abs(a_tru)))) + (digits - 1)
    eps = 0.51 * (10**-n)
    lower_bound = a_tru - eps
    upper_bound = a_tru + eps

    # Check if submitted answer is in bounds
    return (a_sub > lower_bound) & (a_sub < upper_bound)


def get_uuid():
    """get_uuid()

    Returns the string representation of a new random UUID.
    """
    return str(uuid.uuid4())
