import lxml.html
import numpy as np
import sys
import prairielearn


# TODO: add library function to check element attributes (like in numberInput.js)
# TODO: don't use exceptions to signal things like invalid comparison (e.g., when a_sub and a_tru are not same size)?
#       (this is dangerous because it hides real bugs)

def prepare(element_html, element_index, question_data):
    element = lxml.html.fragment_fromstring(element_html)
    name = element.get("name")

    # print("This is some debugging output from matrixInputPy in prepare for element name '%s'" % name)

    question_data["params"][name] = {
        "_grade": "matrixInputPy",
        "_weight": 1,
    };

    return question_data

def render(element_html, element_index, question_data):
    element = lxml.html.fragment_fromstring(element_html)
    name = element.get("name")

    html = ""
    for child in element:
        if child.tag == "variable":
            # TODO: Disable input if question_data.editable is False.
            # TODO: Put submitted answer there if it's non-null.
            html += '<p><div><span style="display:table-cell">'+prairielearn.inner_html(child)+'</span><span style="display:table-cell;width:100%"><input name="'+child.get("name")+'" style="width:100%"/></span></div></p>\n'

    return html

def parse(element_html, element_index, question_data):
    # By convention, this function returns at the first error found

    element = lxml.html.fragment_fromstring(element_html)
    name = element.get("name")

    # Iterate over all variables
    for child in element:
        if child.tag == "variable":
            # Get name of variable or raise KeyError if it does not exist
            var_name = child.get("name",None)
            if var_name is None:
                raise KeyError('all variables in element %s must have a name' % name)

            # Get submitted answer or return parse_error if it does not exist
            var_sub = question_data["submitted_answer"].get(var_name,None)
            if var_sub is None:
                question_data["parse_errors"][var_name] = 'No submitted answer.'
                return question_data

            # Convert submitted answer to numpy array (return parse_error on failure)
            (var_sub_parsed,parse_error) = matlab_to_numpy(var_sub)
            if var_sub_parsed is None:
                question_data["parse_errors"][var_name] = parse_error
                return question_data

            # Replace submitted answer with numpy array
            question_data["submitted_answer"][var_name] = var_sub_parsed.tolist()

    return question_data




# # Get true answer or raise KeyError if it does not exist
# var_tru = question_data["true_answer"][var_name]



def grade(element_html, element_index, question_data):
    element = lxml.html.fragment_fromstring(element_html)
    name = element.get("name")
    grading = {}

    # Iterate over all variables
    for child in element:
        if child.tag == "variable":

            # Get name of variable or raise KeyError if it does not exist
            var_name = child.get("name",None)
            if var_name is None:
                raise KeyError('all variables in element %s must have a name' % name)

            # Get weight
            weight = child.get("weight",1)
            # TODO: check that weight is valid?

            # Get true answer (if it does not exist, create no grade - leave it
            # up to the question code)
            a_tru = question_data["true_answer"].get(var_name,None)
            if a_tru is None:
                continue
            # Convert true answer to numpy
            a_tru = np.array(a_tru)
            # Throw an error if true answer is not a 2D numpy array
            if a_tru.ndim != 2:
                raise ValueError('true answer must be a 2D array')

            # Get submitted answer (if it does not exist, score is zero)
            a_sub = question_data["submitted_answer"].get(var_name,None)
            if a_sub is None:
                grading[var_name] = {"score": 0, "weight": weight}
                continue
            # Convert submitted answer to numpy
            a_sub = np.array(a_sub)

            # If true and submitted answers have different shapes, score is zero
            if not (a_sub.shape==a_tru.shape):
                grading[var_name] = {"score": 0, "weight": weight}
                continue

            # Get method of comparison, with relabs as default
            comparison = child.get("comparison","relabs")

            # Compare submitted answer with true answer
            if comparison=="relabs":
                rtol = float(child.get("rtol","1e-5"))
                atol = float(child.get("atol","1e-8"))
                correct = is_correct_ndarray2D_ra(a_sub,a_tru,rtol,atol)
            elif comparison=="sigfig":
                digits = int(child.get("digits","2"))
                eps_digits = int(child.get("eps_digits","3"))
                correct = is_correct_ndarray2D_sf(a_sub,a_tru,digits,eps_digits)
            elif comparison=="decdig":
                digits = int(child.get("digits","2"))
                eps_digits = int(child.get("eps_digits","3"))
                correct = is_correct_ndarray2D_dd(a_sub,a_tru,digits,eps_digits)
            else:
                raise ValueError('method of comparison "%s" is not valid' % comparison)

            if correct:
                grading[var_name] = {"score": 1, "weight": weight}
            else:
                grading[var_name] = {"score": 0, "weight": weight}

    return grading

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
                return (None,'Rows 1 and %d of matrix have a different number of columns.' % i+1)

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

# def matlab_to_numpy(a):
#     if (('[' in a) and (']' in a)):
#         # Get everything between the square brackets
#         a = a.partition('[')[-1].rpartition(']')[0]
#         # Split on semicolon
#         a = a.split(';')
#         # Get number of rows
#         m = len(a)
#         if (m==0):
#             return np.zeros((0,0))
#         # Get number of columns
#         n = len(a[0].split())
#         if (n==0):
#             return np.zeros((0,0))
#         # Define matrix in which to put result
#         A = np.zeros((m,n))
#         # Iterate over rows
#         for i in range(0,m):
#             s = a[i].split()
#             if (len(s) != n):
#                 return np.zeros((0,0))
#             # Iterate over columns
#             for j in range(0,n):
#                 try:
#                     A[i,j] = float(s[j])
#                 except:
#                     return np.zeros((0,0))
#         return A
#     else:
#         try:
#             A = np.array([[float(a)]])
#             return A
#         except:
#             return np.zeros((0,0))


########################################
# FUNCTIONS FOR COMPARISON
#
# TODO: Put these somewhere else, in a library

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

# def prepare_for_comparison_ndarray2D(a_sub,a_tru):
#     # Both inputs must be finite
#     if not np.all(np.isfinite(a_sub)) or not np.all(np.isfinite(a_tru)):
#         raise ValueError('both inputs to is_close_ndarray2D must be finite')
#     # Both inputs must be real
#     if not np.isrealobj(a_sub) or not np.isrealobj(a_tru):
#         raise TypeError('both inputs to is_close_ndarray2D must be real')
#     # Convert inputs to ndarrays
#     if np.isscalar(a_sub):
#         a_sub = np.array([[a_sub]])
#     else:
#         a_sub = np.array(a_sub)
#     if np.isscalar(a_tru):
#         a_tru = np.array([[a_tru]])
#     else:
#         a_tru = np.array(a_tru)
#     # These ndarrays must be 2D
#     if (a_sub.ndim != 2) or (a_tru.ndim != 2):
#         raise TypeError('both inputs to is_close_ndarray2D must be scalar or 2D array-like objects')
#     # These ndarrays must be the same shape
#     if not (a_sub.shape==a_tru.shape):
#         raise TypeError('both inputs to is_close_ndarray2D must be arrays of the same shape')
#
#     # Everything is fine, return ndarrays for comparison
#     return (a_sub,a_tru)

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

#
########################################
