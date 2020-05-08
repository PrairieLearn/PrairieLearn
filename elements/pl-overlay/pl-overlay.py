import prairielearn as pl
import lxml.html
import chevron
import os


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=['width', 'height'], optional_attribs=[])
    for child in element:
        if child.tag != 'pl-location':
            raise ValueError(f'Unknown tag "{child.tag}" found as child of pl-overlay')
        pl.check_attribs(child, required_attribs=['x', 'y'], optional_attribs=['center'])


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)

    width = pl.get_float_attrib(element, 'width')
    height = pl.get_float_attrib(element, 'height')

    locations = []
    z_index = 0
    for child in element:
        obj = {
            'x': pl.get_float_attrib(child, 'x'),
            'y': pl.get_float_attrib(child, 'y'),
            'center': pl.get_boolean_attrib(child, 'center', False),
            'html': pl.inner_html(child),
            'z_index': z_index
        }
        locations.append(obj)
        z_index += 1

    html_params = {
        'width': width,
        'height': height,
        'locations': locations
    }
    with open('pl-overlay.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()
    return html
