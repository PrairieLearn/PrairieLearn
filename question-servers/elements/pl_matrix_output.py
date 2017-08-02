import lxml.html
import numpy as np
import prairielearn as pl

def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=[], optional_attribs=[])
    return data

def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    html = "<pre>\n"
    for child in element:
        if child.tag == "variable":
            pl.check_attribs(child, required_attribs=["params_name"], optional_attribs=[])
            var_name = pl.get_string_attrib(child, "params_name")
            var_data = data["params"].get(var_name,None)
            if var_data is None:
                raise Exception('No value in data["params"] for variable %s in matrix_output element' % var_name)
            html += pl.inner_html(child) \
                + " = " \
                + pl.numpy_to_matlab(np.array(var_data)) \
                + "\n"
    html += "</pre>"
    return html

def parse(element_html, element_index, data):
    return data

def grade(element_html, element_index, data):
    return data
