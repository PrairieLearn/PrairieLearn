import prairielearn as pl
import lxml.html
import chevron


VALIGN_DEFAULT = 'middle'
HALIGN_DEFAULT = 'center'
CLIP_DEFAULT = True

VALIGN_VALUES = ['top', 'middle', 'center', 'bottom']
HALIGN_VALUES = ['left', 'middle', 'center', 'right']

# Percent to translate each alignment by.  This is relative to the top-left corner of the element.
ALIGNMENT_TO_PERC = {
    'top': '0%',
    'left': '0%',
    'middle': '-50%',
    'center': '-50%',
    'bottom': '-100%',
    'right': '-100%'
}


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=['width', 'height'], optional_attribs=['clip'])
    for child in element:
        if child.tag != 'pl-location':
            raise ValueError(f'Unknown tag "{child.tag}" found as child of pl-overlay')
        pl.check_attribs(child, required_attribs=[], optional_attribs=['left', 'right', 'top', 'bottom', 'valign', 'halign'])

        if ('left' not in child.attrib and 'right' not in child.attrib) or ('left' in child.attrib and 'right' in child.attrib):
            raise ValueError('pl-location requires one of "left" or "right" attributes.')

        if ('top' not in child.attrib and 'bottom' not in child.attrib) or ('top' in child.attrib and 'bottom' in child.attrib):
            raise ValueError('pl-location requires one of "top" or "bottom" attributes.')
        
        valign = pl.get_string_attrib(child, 'valign', None)
        if valign is not None and valign not in VALIGN_VALUES:
            raise ValueError(f'Unknown vertical alignment "{valign}"')

        halign = pl.get_string_attrib(child, 'halign', None)
        if halign is not None and halign not in HALIGN_VALUES:
            raise ValueError(f'Unknown horizontal alignment "{halign}"')


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    width = pl.get_float_attrib(element, 'width')
    height = pl.get_float_attrib(element, 'height')
    
    # Assign layer index in order children are defined
    # Later defined elements will be placed on top of earlier ones
    locations = []
    z_index = 0
    for child in element:
        valign = pl.get_string_attrib(child, 'valign', VALIGN_DEFAULT)
        halign = pl.get_string_attrib(child, 'halign', HALIGN_DEFAULT)

        left = pl.get_float_attrib(child, 'left', None)
        right = pl.get_float_attrib(child, 'right', None)
        top = pl.get_float_attrib(child, 'top', None)
        bottom = pl.get_float_attrib(child, 'bottom', None)

        # We allow both left/right and top/bottom but only set top and left
        # so we don't have to worry about all the alignment possibilities
        if left is not None:
            x = left
        elif right is not None:
            x = width - right

        if top is not None:
            y = top
        elif bottom is not None:
            y = height - bottom

        hoff = ALIGNMENT_TO_PERC[halign]
        voff = ALIGNMENT_TO_PERC[valign]
        transform = f'translate({hoff}, {voff})'

        style = f'top: {y}px; left: {x}px; transform: {transform}; z-index: {z_index}'
        obj = {
            'html': pl.inner_html(child),
            'outer_style': style,
        }
        locations.append(obj)
        z_index += 1

    html_params = {
        'width': width,
        'height': height,
        'locations': locations,
        'clip': pl.get_boolean_attrib(element, 'clip', CLIP_DEFAULT)
    }
    with open('pl-overlay.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()
    return html
