import prairielearn as pl
import lxml.html
import chevron
import json


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=[], optional_attribs=['engine'])


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    engine = pl.get_string_attrib(element, 'engine', 'dot')

    # Read the contents of this element as the data to render
    # we dump the string to json to ensure that newlines are
    # properly encoded
    graphviz_data = json.dumps(str(element.text))

    html_params = {
        'uuid': pl.get_uuid(),
        'workerURL': '/node_modules/viz.js/full.render.js',
        'data': graphviz_data,
        'engine': engine,
    }

    with open('pl-graphviz-render.mustache') as f:
        html = chevron.render(f, html_params).strip()

    return html
