import lxml.html
import to_precision
import numpy as np

def inner_html(element):
    html = element.text
    for child in element:
        html += lxml.html.tostring(child, method="html", pretty_print=True).decode("utf-8")
    return html

def check_attribs(element, required_attribs, optional_attribs):
    for name in required_attribs:
        if name not in element.attrib:
            raise Exception("Required attribute \"%s\" missing" % name);
    extra_attribs = list(set(element.attrib) - set(required_attribs) - set(optional_attribs));
    for name in extra_attribs:
        raise Exception("Unknown attribute \"%s\"" % name);

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
        raise Exception("Only one additional argument is allowed")
    if name not in element.attrib:
        if len(args) == 1:
            return (args[0], True)
        else:
            raise Exception("Attribute \"%s\" missing and no default is available" % name)
    return (element.attrib[name], False)

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

    true_values = ["true", "t", "1", "True", "T", "TRUE", "yes", "y", "Yes", "Y", "YES"]
    false_values = ["false", "f", "0", "False", "F", "FALSE", "no", "n", "No", "N", "NO"]

    if val in true_values:
        return True
    elif val in false_values:
        return False
    else:
        raise Exception("Attribute \"%s\" must be a boolean value: %s" % (name, val))

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
        raise Exception("Attribute \"%s\" must be an integer: %s" % (name, val))
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
        raise Exception("Attribute \"%s\" must be a number: %s" % (name, val))
    return float_val

# This function assumes that A is either a floating-point number or a
# real-valued numpy array. It returns A as a MATLAB-formatted string.
def numpy_to_matlab(A,ndigits=2,wtype='f'):
    if np.isscalar(A):
        A_str = '{:.{indigits}{iwtype}};'.format(A,indigits=ndigits,iwtype=wtype)
        return A_str
    else:
        s = A.shape
        m = s[0]
        n = s[1]
        A_str = '['
        for i in range(0,m):
            for j in range(0,n):
                A_str += '{:.{indigits}{iwtype}}'.format(A[i,j],indigits=ndigits,iwtype=wtype)
                if j==n-1:
                    if i==m-1:
                        A_str += '];'
                    else:
                        A_str += '; '
                else:
                    A_str += ' '
        return A_str

# This function assumes that A is either a floating-point number or a
# real-valued numpy array. It returns A as a MATLAB-formatted string
# in which each entry has ndigits significant digits.
def numpy_to_matlab_sf(A,ndigits=2):
    if np.isscalar(A):
        A_str = to_precision.to_precision(A,ndigits)
        return A_str
    else:
        s = A.shape
        m = s[0]
        n = s[1]
        A_str = '['
        for i in range(0,m):
            for j in range(0,n):
                A_str += to_precision.to_precision(A[i,j],ndigits)
                if j==n-1:
                    if i==m-1:
                        A_str += '];'
                    else:
                        A_str += '; '
                else:
                    A_str += ' '
        return A_str

def matlab_to_numpy(a):
    if (('[' in a) and (']' in a)):
        # Split at first left bracket
        (a_before_leftbracket,a_leftbracket,a) = a.partition('[')

        # Return error if there was anything but space before left bracket
        if a_before_leftbracket.strip():
            return (None,'Non-empty space before first left bracket.')

        # Split at first right bracket
        (a,a_rightbracket,a_after_rightbracket) = a.partition(']')

        # Return error if there was anything but space after right bracket
        if a_after_rightbracket.strip():
            return (None,'Non-empty space after first right bracket.')

        # Split on semicolon
        a = a.split(';')

        # Get number of rows
        m = len(a)

        # Return error if there are no rows (i.e., the matrix is empty)
        if (m==0):
            return (None,'Matrix has no rows.')

        # Get number of columns by splitting first row on space
        n = len(a[0].split())

        # Return error if first row has no columns
        if (n==0):
            return (None,'First row of matrix has no columns.')

        # Define matrix in which to put result
        A = np.zeros((m,n))

        # Iterate over rows
        for i in range(0,m):

            # Split on space
            s = a[i].split()

            # Return error if current row has more or less columns than first row
            if (len(s) != n):
                return (None,'Rows 1 and %d of matrix have a different number of columns.' % (i+1))

            # Iterate over columns
            for j in range(0,n):
                try:
                    # Convert entry to float
                    A[i,j] = float(s[j])

                    # Return error if entry is not finite
                    if not np.isfinite(A[i,j]):
                        return (None,'Entry (%d,%d) of matrix is not finite.' % (i+1,j+1))
                except:
                    # Return error if entry could not be converted to float
                    return (None,'Entry (%d,%d) of matrix has invalid format.' % (i+1,j+1))

        # Return resulting ndarray with no error
        return (A,None)
    else:
        try:
            # Convert submitted answer (assumed to be a scalar) to float
            A = np.array([[float(a)]])
            # Return it with no error
            return (A,None)
        except:
            # Return error if submitted answer coult not be converted to float
            return (None,'Invalid format (missing square brackets and not a real number).')

def is_correct_ndarray2D_dd(a_sub,a_tru,digits=2,eps_digits=3):
    # Check if each element is correct
    m = a_sub.shape[0]
    n = a_sub.shape[1]
    for i in range(0,m):
        for j in range(0,n):
            if not is_correct_scalar_dd(a_sub[i,j],a_tru[i,j],digits,eps_digits):
                return False

    # All elements were close
    return True

def is_correct_ndarray2D_sf(a_sub,a_tru,digits=2,eps_digits=3):
    # Check if each element is correct
    m = a_sub.shape[0]
    n = a_sub.shape[1]
    for i in range(0,m):
        for j in range(0,n):
            if not is_correct_scalar_sf(a_sub[i,j],a_tru[i,j],digits,eps_digits):
                return False

    # All elements were close
    return True

def is_correct_ndarray2D_ra(a_sub,a_tru,rtol=1e-5,atol=1e-8):
    # Check if each element is correct
    return np.allclose(a_sub,a_tru,rtol,atol)

def is_correct_scalar_ra(a_sub,a_tru,rtol=1e-5,atol=1e-8):
    return np.allclose(a_sub,a_tru,rtol,atol)

def is_correct_scalar_dd(a_sub,a_tru,digits=2,eps_digits=3):
    # Get bounds on submitted answer
    m = 10**digits
    eps = 10**-(digits+eps_digits)
    lower_bound = (np.floor(m*(a_tru-eps))/m)-eps
    upper_bound = (np.ceil(m*(a_tru+eps))/m)+eps

    # Check if submitted answer is in bounds
    return (a_sub > lower_bound) & (a_sub < upper_bound)

def is_correct_scalar_sf(a_sub,a_tru,digits=2,eps_digits=3):
    # Get bounds on submitted answer
    n = -int(np.floor(np.log10(np.abs(a_tru))))+(digits-1)
    m = 10**n
    eps = 10**-(n+eps_digits)
    lower_bound = (np.floor(m*(a_tru-eps))/m)-eps
    upper_bound = (np.ceil(m*(a_tru+eps))/m)+eps

    # Check if submitted answer is in bounds
    return (a_sub > lower_bound) & (a_sub < upper_bound)

def get_digits_for_sf(a,digits):
    return -int(floor(log10(a)))+(digits-1)
