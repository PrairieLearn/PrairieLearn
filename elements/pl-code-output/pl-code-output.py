import prairielearn as pl
import lxml.html
import pandas as pd

VARIABLE_TYPE_DEFAULT = 'text'
NO_HIGHLIGHT_DEFAULT = False
VARIABLE_PREFIX_DEFAULT = ''
VARIABLE_SUFFIX_DEFAULT = ''


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=['variable-name'], optional_attribs=['variable-type', 'no-highlight', 'variable-prefix', 'variable-suffix'])


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    vartype = pl.get_string_attrib(element, 'variable-type', VARIABLE_TYPE_DEFAULT)
    varname = pl.get_string_attrib(element, 'variable-name')

    if varname not in data['params']:
        raise Exception('Could not find {} in params!'.format(varname))

    varout = data['params'][varname]
    html = ''

    # render the output variable
    if vartype == 'dataframe':
        varout = pl.from_json(varout)
        html += varout.to_html(classes=['pl-code-output-table']) + '<p class="pl-code-output-table-dimensions">{} rows x {} columns</p><br>'.format(str(varout.shape[0]), str(varout.shape[1]))
    elif vartype == 'text':
        no_highlight = pl.get_boolean_attrib(element, 'no-highlight', NO_HIGHLIGHT_DEFAULT)
        prefix = pl.get_string_attrib(element, 'variable-prefix', VARIABLE_PREFIX_DEFAULT)
        suffix = pl.get_string_attrib(element, 'variable-suffix', VARIABLE_SUFFIX_DEFAULT)

        varout = pl.from_json(varout)
        text = prefix + repr(varout) + suffix
        html += '<pl-code language="python" no-highlight="{}">{}</pl-code>'.format(no_highlight, text)
    else:
        raise Exception('{} is not a valid variable type!'.format(vartype))

    return html
