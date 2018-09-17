import prairielearn as pl
import lxml.html
import chevron
import os


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['script-name']
    optional_attribs = ['param-names', 'width', 'height']
    pl.check_attribs(element, required_attribs, optional_attribs)
    return data


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    script_name = pl.get_string_attrib(element, 'script-name', None)

    with open(os.path.join(data['options']['question_path'], script_name)) as f:
        script = f.read()

    width = pl.get_string_attrib(element, 'width', '500')
    height = pl.get_string_attrib(element, 'height', '300')

    params_names = pl.get_string_attrib(element, 'param-names', None)
    if params_names is None:
        client_params = {}
    else:
        params_names = params_names.split(sep=',')
        client_params = {key: data['params'][key] for key in params_names}

    html_params = {
        'script': script,
        'width': width,
        'height': height,
        'client_params': client_params,
        'uuid': pl.get_uuid(),
    }

    with open('pl-prairiedraw-figure.mustache') as f:
        html = chevron.render(f, html_params).strip()

    return html
