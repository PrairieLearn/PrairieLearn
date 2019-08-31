import prairielearn as pl
import lxml.html
import numpy as np


DIGITS_DEFAULT = 2
def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['params-name']
    optional_attribs = ['digits', 'presentation-type']
    pl.check_attribs(element, required_attribs, optional_attribs)


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)

    # Get the number of digits to output
    digits = pl.get_integer_attrib(element, 'digits', DIGITS_DEFAULT)
    # Get the presentation type
    presentation_type = pl.get_string_attrib(element, 'presentation-type', 'f')

    var_name = pl.get_string_attrib(element, 'params-name')
    # Get value of variable, raising exception if variable does not exist
    var_data = data['params'].get(var_name, None)

    if var_data is None:
        raise Exception('No value in data["params"] for variable %s in pl-matrix-latex element' % var_name)

    # If the variable is in a format generated by pl.to_json, convert it
    # back to a standard type (otherwise, do nothing)
    var_data = pl.from_json(var_data)

    if not np.isscalar(var_data):
        var_data = np.array(var_data)
        # Check if numpy array type is numeric (integer, float or complex)
        if np.issubdtype(var_data.dtype, np.number):
            # Check shape of variable
            if var_data.ndim != 2:
                raise Exception('Value in data["params"] for variable %s in pl-matrix-latex element must be 2D array or scalar' % var_name)
        else:
            raise Exception('Value in data["params"] for variable %s in pl-matrix-latex element must be numeric' % var_name)

    # Create string for latex matrix format
    html = pl.latex_from_2darray(var_data, presentation_type=presentation_type, digits=digits)

    return html
