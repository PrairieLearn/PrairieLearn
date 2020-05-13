import prairielearn as pl
import lxml.html
import chevron


CENTER_DEFAULT = False
CLIP_DEFAULT = True


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=['width', 'height'], optional_attribs=['clip'])
    for child in element:
        if child.tag != 'pl-location':
            raise ValueError(f'Unknown tag "{child.tag}" found as child of pl-overlay')
        pl.check_attribs(child, required_attribs=['x', 'y'], optional_attribs=['center'])


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)

    # Assign layer index in order children are defined
    # Later defined elements will be placed on top of earlier ones
    locations = []
    z_index = 0
    for child in element:
        obj = {
            'x': pl.get_float_attrib(child, 'x'),
            'y': pl.get_float_attrib(child, 'y'),
            'center': pl.get_boolean_attrib(child, 'center', CENTER_DEFAULT),
            'html': pl.inner_html(child),
            'z_index': z_index
        }
        locations.append(obj)
        z_index += 1

    html_params = {
        'width': pl.get_float_attrib(element, 'width'),
        'height': pl.get_float_attrib(element, 'height'),
        'locations': locations,
        'clip': pl.get_boolean_attrib(element, 'clip', CLIP_DEFAULT)
    }
    with open('pl-overlay.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()
    return html
