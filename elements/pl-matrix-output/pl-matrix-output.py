import prairielearn as pl
import lxml.html
import numpy as np
import chevron


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = ['digits', 'default-tab', 'show-matlab', 'show-mathematica', 'show-python']
    pl.check_attribs(element, required_attribs, optional_attribs)


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    digits = pl.get_integer_attrib(element, 'digits', 2)
    display_matlab_tab = pl.get_boolean_attrib(element, 'show-matlab', True)
    display_mathematica_tab = pl.get_boolean_attrib(element, 'show-mathematica', True)
    display_python_tab = pl.get_boolean_attrib(element, 'show-python', True)
    default_tab = pl.get_string_attrib(element, 'default-tab', 'matlab')

    # Handles cases when Matlab tab hidden, if python is default tab don't overwite active tab setting
    if display_matlab_tab is False and default_tab != 'python':
        if display_mathematica_tab is True:
            default_tab = 'mathematica'
        elif display_python_tab is True:
            default_tab = 'python'

    # Default active tab makes sure display is also active
    active_tab_matlab = False
    active_tab_mathematica = False
    active_tab_python = False
    if default_tab == 'matlab' and display_matlab_tab is True:
        active_tab_matlab = True
    elif default_tab == 'mathematica' and display_mathematica_tab is True:
        active_tab_mathematica = True
    elif default_tab == 'python' and display_python_tab is True:
        active_tab_python = True

    # Process parameter data
    matlab_data = ''
    mathematica_data = ''
    python_data = 'import numpy as np\n\n'
    for child in element:
        if child.tag == 'variable':
            # Raise exception of variable does not have a name
            pl.check_attribs(child, required_attribs=['params-name'], optional_attribs=['comment', 'digits'])

            # Get name of variable
            var_name = pl.get_string_attrib(child, 'params-name')

            # Get value of variable, raising exception if variable does not exist
            var_data = data['params'].get(var_name, None)
            if var_data is None:
                raise Exception('No value in data["params"] for variable %s in pl-matrix-output element' % var_name)

            # If the variable is in a format generated by pl.to_json, convert it
            # back to a standard type (otherwise, do nothing)
            var_data = pl.from_json(var_data)

            # Get comment, if it exists
            var_matlab_comment = ''
            var_mathematica_comment = ''
            var_python_comment = ''
            if pl.has_attrib(child, 'comment'):
                var_comment = pl.get_string_attrib(child, 'comment')
                var_matlab_comment = '% {}'.format(var_comment)
                var_mathematica_comment = '(* {} *)'.format(var_comment)
                var_python_comment = '# {}'.format(var_comment)

            # Get digit for child, if it exists
            if pl.has_attrib(child, 'digits') is False:
                var_digits = digits
            else:
                var_digits = pl.get_string_attrib(child, 'digits')

            # Assembling Python array formatting
            if np.isscalar(var_data):
                prefix = ''
                suffix = ''
            else:
                # Wrap the variable in an ndarray (if it's already one, this does nothing)
                var_data = np.array(var_data)
                # Check shape of variable
                if var_data.ndim != 2:
                    raise Exception('Value in data["params"] for variable %s in pl-matrix-output element must be a scalar or a 2D array' % var_name)
                # Create prefix/suffix so python string is np.array( ... )
                prefix = 'np.array('
                suffix = ')'

            # Mathematica reserved letters: C D E I K N O
            mathematica_reserved = ['C', 'D', 'E', 'I', 'K', 'N', 'O']
            if pl.inner_html(child) in mathematica_reserved:
                mathematica_suffix = 'm'
            else:
                mathematica_suffix = ''

            # Create string for matlab and python format
            var_name_disp = pl.inner_html(child)
            var_matlab_data = pl.string_from_2darray(var_data, language='matlab', digits=var_digits)
            var_mathematica = pl.string_from_2darray(var_data, language='mathematica', digits=var_digits)
            var_python_data = pl.string_from_2darray(var_data, language='python', digits=var_digits)

            matlab_data += '{} = {}; {}\n'.format(var_name_disp, var_matlab_data, var_matlab_comment)
            mathematica_data += '{}{} = {}; {}\n'.format(var_name_disp, mathematica_suffix, var_mathematica, var_mathematica_comment)
            python_data += '{} = {}{}{} {}\n'.format(var_name_disp, prefix, var_python_data, suffix, var_python_comment)

    html_params = {
        'active_tab_matlab': active_tab_matlab,
        'active_tab_mathematica': active_tab_mathematica,
        'active_tab_python': active_tab_python,
        'display_matlab_tab': display_matlab_tab,
        'display_mathematica_tab': display_mathematica_tab,
        'display_python_tab': display_python_tab,
        'matlab_data': matlab_data,
        'mathematica_data': mathematica_data,
        'python_data': python_data,
        'uuid': pl.get_uuid()
    }

    with open('pl-matrix-output.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()

    return html
