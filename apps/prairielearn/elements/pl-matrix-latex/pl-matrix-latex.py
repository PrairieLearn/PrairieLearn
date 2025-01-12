import numbers

import lxml.html
import numpy as np
import prairielearn as pl

DIGITS_DEFAULT = 2
PRESENTATION_TYPE_DEFAULT = "f"


def prepare(element_html: str, _data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["params-name"]
    optional_attribs = ["digits", "presentation-type"]
    pl.check_attribs(element, required_attribs, optional_attribs)


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)

    # Get the number of digits to output
    digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
    # Get the presentation type
    presentation_type = pl.get_string_attrib(
        element, "presentation-type", PRESENTATION_TYPE_DEFAULT
    )

    var_name = pl.get_string_attrib(element, "params-name")
    # Get value of variable, raising exception if variable does not exist
    var_data = data["params"].get(var_name, None)

    if var_data is None:
        raise ValueError(
            f'No value in data["params"] for variable {var_name} in pl-matrix-latex element'
        )

    # If the variable is in a format generated by pl.to_json, convert it
    # back to a standard type (otherwise, do nothing)
    var_data = pl.from_json(var_data)

    if not isinstance(var_data, numbers.Number):
        var_data = np.array(var_data)
        # Check if numpy array type is numeric (integer, float or complex)
        if np.issubdtype(var_data.dtype, np.number):
            # Check shape of variable
            if var_data.ndim != 2:
                raise ValueError(
                    f'Value in data["params"] for variable {var_name} in pl-matrix-latex element must be 2D array or scalar'
                )
        else:
            raise ValueError(
                f'Value in data["params"] for variable {var_name} in pl-matrix-latex element must be numeric'
            )

    # Create string for latex matrix format
    return pl.latex_from_2darray(
        var_data, presentation_type=presentation_type, digits=digits
    )
