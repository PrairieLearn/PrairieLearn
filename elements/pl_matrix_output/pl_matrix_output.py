import prairielearn as pl
import lxml.html
import numpy as np
import chevron


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=[], optional_attribs=['digits'])


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    digits = pl.get_integer_attrib(element, 'digits', 2)

    matlab_data = ''
    python_data = 'import numpy as np\n\n'
    for child in element:
        if child.tag == 'variable':
            pl.check_attribs(child, required_attribs=['params_name'], optional_attribs=[])
            var_name = pl.get_string_attrib(child, 'params_name')
            var_data = data['params'].get(var_name, None)
            if var_data is None:
                raise Exception('No value in data["params"] for variable %s in pl_matrix_output element' % var_name)
            if np.isscalar(var_data):
                matlab_data += pl.inner_html(child) + ' = ' + pl.numpy_to_matlab(var_data, ndigits=digits) + ';\n'
                python_data += pl.inner_html(child) + ' = ' + str(np.array(var_data).round(digits).tolist()) + '\n'
            else:
                var_data = np.array(var_data)
                if var_data.ndim != 2:
                    raise Exception('Value in data["params"] for variable %s in pl_matrix_output element is neither a scalar nor a 2D array' % var_name)
                matlab_data += pl.inner_html(child) + ' = ' + pl.numpy_to_matlab(np.array(var_data), ndigits=digits) + ';\n'
                python_data += pl.inner_html(child) + ' = np.array(' + str(np.array(var_data).round(digits).tolist()) + ')\n'

    html_params = {'default_is_matlab': True, 'matlab_data': matlab_data, 'python_data': python_data, 'element_index': element_index}
    with open('pl_matrix_output.mustache', 'r') as f:
        html = chevron.render(f, html_params).strip()

    return html
