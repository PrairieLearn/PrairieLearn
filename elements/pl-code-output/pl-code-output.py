import prairielearn as pl
import lxml.html
import chevron
import json
import numpy as np
import numpy.linalg as la
import pandas as pd
import math
import os
import itertools


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=['variable-name'], optional_attribs=['variable-type', 'no-highlight', 'variable-prefix', 'variable-suffix'])

def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    vartype = pl.get_string_attrib(element, 'variable-type', "text")
    varname = pl.get_string_attrib(element, 'variable-name')

    if not varname in data['params']:
        raise Exception("Could not find {} in params!".format(varname))

    varout = data['params'][varname]
    html = ""
    
    # render the output variable
    if vartype == "dataframe":
        varout = pd.read_json(varout)
        html += varout.to_html(classes=['pl-code-output-table']) + "<p class='pl-code-output-table-dimensions'>" + str(varout.shape[0]) + " rows x " + str(varout.shape[1]) + " columns</p><br>"
    elif vartype == "text":
        no_highlight = pl.get_boolean_attrib(element, "no-highlight", False)
        prefix = pl.get_string_attrib(element, 'variable-prefix', "")
        suffix = pl.get_string_attrib(element, 'variable-suffix', "")

        varout = pl.from_json(varout)
        text = prefix + repr(varout) + suffix
        html += "<pl-code language='python' no-highlight='{}'>{}</pl-code>".format(no_highlight, text)
    else:
        raise Exception("{} is not a valid variable type!".format(vartype))
        
    return html
