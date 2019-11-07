import prairielearn as pl
import lxml.html

NO_HIGHLIGHT_DEFAULT = False
PREFIX_DEFAULT = ''
SUFFIX_DEFAULT = ''
TEXT_DEFAULT = False


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=['params-name'], optional_attribs=['text', 'no-highlight', 'prefix', 'suffix'])


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    force_text = pl.get_boolean_attrib(element, 'text', TEXT_DEFAULT)
    varname = pl.get_string_attrib(element, 'params-name')

    if varname not in data['params']:
        raise Exception('Could not find {} in params!'.format(varname))

    var_out = data['params'][varname]
    html = ''
    var_type = 'text'

    # determine the type of variable to render
    if isinstance(var_out, dict) and '_type' in var_out:
        if not force_text:
            var_type = var_out['_type']
        var_out = pl.from_json(var_out)

    # render the output variable
    if var_type == 'dataframe':
        html += var_out.to_html(classes=['pl-python-variable-table']) + '<p class="pl-python-variable-table-dimensions">{} rows x {} columns</p><br>'.format(str(var_out.shape[0]), str(var_out.shape[1]))
    else:
        no_highlight = pl.get_boolean_attrib(element, 'no-highlight', NO_HIGHLIGHT_DEFAULT)
        prefix = pl.get_string_attrib(element, 'prefix', PREFIX_DEFAULT)
        suffix = pl.get_string_attrib(element, 'suffix', SUFFIX_DEFAULT)

        text = prefix + repr(var_out) + suffix
        html += '<pl-code language="python" no-highlight="{}">{}</pl-code>'.format(no_highlight, text)

    return html
