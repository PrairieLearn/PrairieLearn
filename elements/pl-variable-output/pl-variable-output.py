import chevron
import lxml.html
import numpy as np
import prairielearn as pl

DIGITS_DEFAULT = 2
SHOW_MATLAB_DEFAULT = True
SHOW_MATHEMATICA_DEFAULT = True
SHOW_PYTHON_DEFAULT = True
SHOW_R_DEFAULT = True
SHOW_SYMPY_DEFAULT = True
DEFAULT_TAB_DEFAULT = "matlab"


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = [
        "digits",
        "default-tab",
        "show-matlab",
        "show-mathematica",
        "show-python",
        "show-r",
        "show-sympy",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    digits = pl.get_integer_attrib(element, "digits", DIGITS_DEFAULT)
    show_matlab = pl.get_boolean_attrib(element, "show-matlab", SHOW_MATLAB_DEFAULT)
    show_mathematica = pl.get_boolean_attrib(
        element, "show-mathematica", SHOW_MATHEMATICA_DEFAULT
    )
    show_python = pl.get_boolean_attrib(element, "show-python", SHOW_PYTHON_DEFAULT)
    show_r = pl.get_boolean_attrib(element, "show-r", SHOW_R_DEFAULT)
    show_sympy = pl.get_boolean_attrib(element, "show-sympy", SHOW_SYMPY_DEFAULT)
    default_tab = pl.get_string_attrib(element, "default-tab", DEFAULT_TAB_DEFAULT)

    tab_list = ["matlab", "mathematica", "python", "r", "sympy"]
    if default_tab not in tab_list:
        raise Exception(f"invalid default-tab: {default_tab}")

    # Setting the default tab
    displayed_tab = [show_matlab, show_mathematica, show_python, show_r, show_sympy]
    if not any(displayed_tab):
        raise Exception(
            "All tabs have been hidden from display. At least one tab must be shown."
        )

    default_tab_index = tab_list.index(default_tab)
    # If not displayed, make first visible tab the default
    if not displayed_tab[default_tab_index]:
        first_display = displayed_tab.index(True)
        default_tab = tab_list[first_display]
    default_tab_index = tab_list.index(default_tab)

    # Active tab should be the default tab
    default_tab_list = [False, False, False, False, False]
    default_tab_list[default_tab_index] = True
    [
        active_tab_matlab,
        active_tab_mathematica,
        active_tab_python,
        active_tab_r,
        active_tab_sympy,
    ] = default_tab_list

    # Process parameter data
    matlab_data = ""
    mathematica_data = ""
    python_data = "import numpy as np\n\n"
    r_data = ""
    sympy_data = "from sympy import *\n\n"
    for child in element:
        if child.tag == "variable":
            # Raise exception if variable does not have a name
            pl.check_attribs(
                child,
                required_attribs=["params-name"],
                optional_attribs=["comment", "digits"],
            )

            # Get name of variable
            var_name = pl.get_string_attrib(child, "params-name")

            # Get value of variable, raising exception if variable does not exist
            var_data = data["params"].get(var_name, None)
            if var_data is None:
                raise Exception(
                    'No value in data["params"] for variable %s in pl-variable-output element'
                    % var_name
                )

            # If the variable is in a format generated by pl.to_json, convert it
            # back to a standard type (otherwise, do nothing)
            var_data = pl.from_json(var_data)

            # Get comment, if it exists
            var_matlab_comment = ""
            var_mathematica_comment = ""
            var_python_comment = ""
            var_r_comment = ""
            var_sympy_comment = ""
            if pl.has_attrib(child, "comment"):
                var_comment = pl.get_string_attrib(child, "comment")
                var_matlab_comment = f" % {var_comment}"
                var_mathematica_comment = f" (* {var_comment} *)"
                var_python_comment = f" # {var_comment}"
                var_r_comment = f" # {var_comment}"
                var_sympy_comment = f" # {var_comment}"

            # Get digit for child, if it exists
            if not pl.has_attrib(child, "digits"):
                var_digits = digits
            else:
                var_digits = pl.get_string_attrib(child, "digits")

            # Assembling Python array formatting
            if np.isscalar(var_data):
                prefix = ""
                suffix = ""
            else:
                # Wrap the variable in an ndarray (if it's already one, this does nothing)
                var_data = np.array(var_data)
                # Check shape of variable
                if var_data.ndim > 2:
                    raise Exception(
                        'Value in data["params"] for variable %s in pl-variable-output element must be a scalar, a vector, or a 2D array'
                        % var_name
                    )
                # Create prefix/suffix so python string is np.array( ... )
                prefix = "np.array("
                suffix = ")"

            # Mathematica reserved letters: C D E I K N O
            mathematica_reserved = ["C", "D", "E", "I", "K", "N", "O"]
            if pl.inner_html(child) in mathematica_reserved:
                mathematica_suffix = "m"
            else:
                mathematica_suffix = ""

            # Create string for matlab and python format
            var_name_disp = pl.inner_html(child)
            var_matlab_data = pl.string_from_numpy(
                var_data, language="matlab", digits=var_digits
            )
            var_mathematica = pl.string_from_numpy(
                var_data, language="mathematica", digits=var_digits
            )
            var_python_data = pl.string_from_numpy(
                var_data, language="python", digits=var_digits
            )
            var_r_data = pl.string_from_numpy(var_data, language="r", digits=var_digits)
            var_sympy_data = pl.string_from_numpy(
                var_data, language="sympy", digits=var_digits
            )

            matlab_data += f"{var_name_disp} = {var_matlab_data};{var_matlab_comment}\n"
            mathematica_data += f"{var_name_disp}{mathematica_suffix} = {var_mathematica};{var_mathematica_comment}\n"
            python_data += f"{var_name_disp} = {prefix}{var_python_data}{suffix}{var_python_comment}\n"
            r_data += f"{var_name_disp} = {var_r_data}{var_r_comment}\n"
            sympy_data += f"{var_name_disp} = {var_sympy_data}{var_sympy_comment}\n"

    html_params = {
        "active_tab_matlab": active_tab_matlab,
        "active_tab_mathematica": active_tab_mathematica,
        "active_tab_python": active_tab_python,
        "active_tab_r": active_tab_r,
        "active_tab_sympy": active_tab_sympy,
        "show_matlab": show_matlab,
        "show_mathematica": show_mathematica,
        "show_python": show_python,
        "show_r": show_r,
        "show_sympy": show_sympy,
        "matlab_data": matlab_data,
        "mathematica_data": mathematica_data,
        "python_data": python_data,
        "r_data": r_data,
        "sympy_data": sympy_data,
        "uuid": pl.get_uuid(),
    }

    with open("pl-variable-output.mustache", "r", encoding="utf-8") as f:
        html = chevron.render(f, html_params).strip()

    return html
