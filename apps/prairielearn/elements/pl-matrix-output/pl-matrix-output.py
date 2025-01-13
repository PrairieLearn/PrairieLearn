import chevron
import lxml.html
import numpy as np
import prairielearn as pl

DIGITS_DEFAULT = 2


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=[], optional_attribs=["digits"])


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)

    matlab_data = ""
    python_data = "import numpy as np\n\n"
    for child in element:
        if child.tag == "variable":
            # Raise exception of variable does not have a name
            pl.check_attribs(
                child, required_attribs=["params-name"], optional_attribs=[]
            )

            # Get name of variable
            var_name = pl.get_string_attrib(child, "params-name")

            # Get value of variable, raising exception if variable does not exist
            var_data = data["params"].get(var_name, None)
            if var_data is None:
                raise ValueError(
                    f'No value in data["params"] for variable {var_name} in pl-matrix-output element'
                )

            # If the variable is in a format generated by pl.to_json, convert it
            # back to a standard type (otherwise, do nothing)
            var_data = pl.from_json(var_data)

            if np.isscalar(var_data):
                prefix = ""
                suffix = ""
            else:
                # Wrap the variable in an ndarray (if it's already one, this does nothing)
                var_data = np.array(var_data)
                # Check shape of variable
                if var_data.ndim != 2:
                    raise ValueError(
                        f'Value in data["params"] for variable {var_name} in pl-matrix-output element must be a scalar or a 2D array'
                    )
                # Create prefix/suffix so python string is np.array( ... )
                prefix = "np.array("
                suffix = ")"

            # Create string for matlab and python format
            matlab_data += (
                pl.inner_html(child)
                + " = "
                + pl.string_from_2darray(var_data, language="matlab", digits=digits)
                + ";\n"
            )
            python_data += (
                pl.inner_html(child)
                + " = "
                + prefix
                + pl.string_from_2darray(var_data, language="python", digits=digits)
                + suffix
                + "\n"
            )

    html_params = {
        "default_is_matlab": True,
        "matlab_data": matlab_data,
        "python_data": python_data,
        "uuid": pl.get_uuid(),
    }

    with open("pl-matrix-output.mustache", encoding="utf-8") as f:
        html = chevron.render(f, html_params).strip()

    return html
