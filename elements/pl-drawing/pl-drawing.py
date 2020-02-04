import prairielearn as pl
import lxml.html
import lxml.etree
import chevron
import json
import warnings
import math
import numpy as np
import numpy.linalg as la
from functools import reduce

# Used for giving user feedback on wrong answers
element_names = {'controlledLine': 'Controlled Line', 'vector': 'Force Vector', 'arc_vector': 'Moment', 'distTrianLoad': 'Distributed Triangular Load', 'point': 'Point'}

# Attributes for each element, automatically generated from doc.md
element_attributes = {
    'pl-drawing': ['gradable', 'answers-name', 'width', 'height', 'grid-size', 'snap-to-grid', 'correct-answer', 'tol', 'angle-tol', 'show-tolerance-hint', 'tolerance-hint', 'hide-answer-panel'],
    'pl-drawing-initial': ['draw-error-box', 'draw-error-box=true'],
    'pl-coordinates': [
        'x1',
        'y1',
        'width',
        'angle',
        'label',
        'offsetx',
        'offsety',
        'label-x',
        'offsetx-label-x',
        'offsety-label-x',
        'label-y',
        'offsetx-label-y',
        'offsety-label-y',
        'color',
        'stroke-width',
        'arrow-head-width',
        'arrow-head-length',
    ],
    'pl-line': ['x1', 'y1', 'width', 'angle', 'x2', 'y2', 'stroke-color', 'stroke-width', 'dashed-size'],
    'pl-arc': ['x1', 'y1', 'radius', 'start-angle', 'end-angle', 'stroke-color', 'stroke-width', 'dashed-size'],
    'pl-point': ['x1', 'y1', 'radius', 'label', 'offsetx', 'offsety', 'color', 'optional-grading'],
    'pl-triangle': ['x1', 'y1', 'x2', 'y2', 'x3', 'y3', 'color', 'stroke-color', 'stroke-width'],
    'pl-rectangle': ['x1', 'y1', 'height', 'width', 'angle', 'color', 'stroke-color', 'stroke-width'],
    'pl-circle': ['x1', 'y1', 'radius', 'color', 'stroke-color', 'stroke-width', 'label', 'offsetx', 'offsety'],
    'pl-polygon': ['plist', 'color', 'stroke-color', 'stroke-width'],
    'pl-rod': ['x1', 'y1', 'x2', 'y2', 'width', 'draw-pin', 'label1', 'offsetx1', 'offsety1', 'label2', 'offsetx2', 'offsety2', 'color', 'stroke-color', 'stroke-width', 'height'],
    'pl-3pointrod': [
        'x1',
        'y1',
        'x2',
        'y2',
        'x3',
        'y3',
        'width',
        'draw-pin',
        'label1',
        'offsetx1',
        'offsety1',
        'label2',
        'offsetx2',
        'offsety2',
        'label3',
        'offsetx3',
        'offsety3',
        'color',
        'stroke-color',
        'stroke-width',
    ],
    'pl-4pointrod': [
        'x1',
        'y1',
        'x2',
        'y2',
        'x3',
        'y3',
        'x4',
        'y4',
        'width',
        'draw-pin',
        'label1',
        'offsetx1',
        'offsety1',
        'label2',
        'offsetx2',
        'offsety2',
        'label3',
        'offsetx3',
        'offsety3',
        'label4',
        'offsetx4',
        'offsety4',
        'color',
        'stroke-color',
        'stroke-width',
    ],
    'pl-collar-rod': [
        'x1',
        'y1',
        'x2',
        'y2',
        'width',
        'draw-pin',
        'label1',
        'offsetx1',
        'offsety1',
        'label2',
        'offsetx2',
        'offsety2',
        'draw-collar-end1',
        'w1',
        'h1',
        'draw-collar-end2',
        'w2',
        'h2',
        'color',
        'stroke-color',
        'stroke-width',
    ],
    'pl-fixed-pin': ['x1', 'y1', 'height', 'width', 'angle', 'draw-pin', 'draw-ground', 'label', 'offsetx', 'offsety', 'color', 'stroke-color', 'stroke-width'],
    'pl-roller': ['x1', 'y1', 'height', 'width', 'angle', 'draw-pin', 'draw-ground', 'label', 'offsetx', 'offsety', 'color', 'stroke-color', 'stroke-width'],
    'pl-clamped': ['x1', 'y1', 'height', 'width', 'angle', 'label', 'offsetx', 'offsety', 'color', 'stroke-width'],
    'pl-spring': ['x1', 'y1', 'width', 'angle', 'height', 'interval', 'x2', 'y2', 'stroke-color', 'stroke-width', 'draw-pin'],
    'pl-pulley': ['x1', 'y1', 'x2', 'y2', 'x3', 'y3', 'alternative-path', 'radius', 'label', 'offsetx', 'offsety', 'color', 'stroke-color', 'stroke-width'],
    'pl-dimensions': [
        'x1',
        'y1',
        'width',
        'angle',
        'x2',
        'y2',
        'dim-offset',
        'dim-offset-angle',
        'start-support-line',
        'end-support-line',
        'label',
        'offsetx',
        'offsety',
        'stroke-color',
        'stroke-width',
        'draw-start-arrow',
        'draw-end-arrow',
        'arrow-head-width',
        'arrow-head-length',
        'color',
    ],
    'pl-arc-dimensions': [
        'x1',
        'y1',
        'radius',
        'start-angle',
        'end-angle',
        'start-support-line',
        'end-support-line',
        'draw-center',
        'draw-start-arrow',
        'draw-end-arrow',
        'label',
        'offsetx',
        'offsety',
        'stroke-color',
        'stroke-width',
        'arrow-head-width',
        'arrow-head-length',
    ],
    'pl-vector': [
        'x1',
        'y1',
        'anchor-is-tail',
        'width',
        'angle',
        'label',
        'offsetx',
        'offsety',
        'color',
        'stroke-width',
        'arrow-head-width',
        'arrow-head-length',
        'disregard-sense',
        'draw-error-box',
        'offset-forward',
        'offset-backward',
        'optional-grading',
    ],
    'pl-double-headed-vector': [
        'x1',
        'y1',
        'anchor-is-tail',
        'width',
        'angle',
        'label',
        'offsetx',
        'offsety',
        'color',
        'stroke-width',
        'arrow-head-width',
        'arrow-head-length',
        'disregard-sense',
        'draw-error-box',
        'offset-forward',
        'offset-backward',
        'optional-grading',
    ],
    'pl-arc-vector': [
        'x1',
        'y1',
        'radius',
        'start-angle',
        'end-angle',
        'draw-center',
        'clockwise-direction',
        'label',
        'offsetx',
        'offsety',
        'color',
        'stroke-width',
        'arrow-head-width',
        'arrow-head-length',
        'disregard-sense',
        'draw-error-box',
        'optional-grading',
    ],
    'pl-distributed-load': [
        'x1',
        'y1',
        'width',
        'spacing',
        'w1',
        'w2',
        'angle',
        'label1',
        'offsetx1',
        'offsety1',
        'label2',
        'offsetx2',
        'offsety2',
        'color',
        'stroke-width',
        'arrow-head-width',
        'arrow-head-length',
        'disregard-sense',
        'draw-error-box',
        'offset-forward',
        'offset-backward',
        'graded',
        'optional-grading',
        'anchor-is-tail',
    ],
    'pl-text': ['label', 'latex', 'font-size', 'x1', 'y1', 'offsetx', 'offsety'],
    'pl-drawing-answer': ['draw-error-box'],
    'pl-axes': [
        'origin',
        'xneg',
        'xpos',
        'yneg',
        'ypos',
        'grid-label',
        'supporting-lines',
        'label-x',
        'offsetx-label-x',
        'offsety-label-x',
        'label-y',
        'offsetx-label-y',
        'offsety-label-y',
        'color',
        'stroke-width',
    ],
    'pl-graph-line': ['origin', 'end-points', 'end-gradients', 'draw-error-box', 'offset-tol-x', 'offset-tol-y', 'offset-control-tol-x', 'offset-control-tol-y', 'color', 'stroke-width'],
}

graded_elements = ['pl-controlled-line', 'pl-controlled-curved-line', 'pl-vector', 'pl-arc-vector', 'pl-distributed-load', 'pl-point', 'pl-double-headed-vector', 'pl-graph-line']

element_defaults = {
    'gradable': False,
    'answers-name': '',
    'draw-error-box': False,
    'grid-size': 20,
    'angle-tol': 10,
    'snap-to-grid': False,
    'width': 580,
    'height': 320,
    'show-tolerance-hint': True,
    'render-scale': 1.5
}

drawing_defaults = {
    'x1': 20,
    'y1': 20,
    'x2': 80,
    'y2': 20,
    'offsetx': 2,
    'offsety': 2,
    'width': 30,
    'width-rod': 20,
    'height': 40,
    'label': '',
    'angle': 0,
    'end-angle': 60,
    'radius': 20,
    'stroke-width': 2,
    'selectable': False,
    'font-size': 16,
    'point-size': 4,
    'force-width': 60
}


def get_error_box(x1, y1, theta, tol, offset_forward, offset_backward):
    # Get the position of the anchor point of the vector
    rpos = np.array([x1, y1])
    # Defining the direction of the vector
    dir = np.array([math.cos(theta), math.sin(theta)])
    # Defining the error box limit in the direction of the vector
    max_forward = offset_forward + tol
    max_backward = offset_backward + tol
    wbox = max_backward + max_forward
    # Defining the error box limit in the direction perpendicular to the vector
    max_perp = tol
    hbox = 2 * max_perp
    pc = rpos - (wbox / 2 - max_forward) * dir
    return (pc, hbox, wbox, max_forward, max_backward)


def format_attrib_name(name):
    spl = name.split('-')
    return reduce(lambda acc, x: acc + x.capitalize(), spl[1:], spl[0])


def union_drawing_items(e1, e2):
    # Union two sets of drawing items, prioritizing e2 in cases of duplicates.

    if 'objects' in e1:
        obj1 = e1['objects']
    else:
        obj1 = []

    if 'objects' in e2:
        obj2 = e2['objects']
    else:
        obj2 = []

    if len(obj1) == 0:
        return e2
    if len(obj2) == 0:
        return e1

    new_ids = []
    for item in obj2:
        new_ids.append(item['id'])

    newobj = []
    for item in obj1:
        if not item['id'] in new_ids:
            newobj.append(item)
    for item in obj2:
        newobj.append(item)

    return {'objects': newobj}


def check_attributes_rec(element):
    # Recursively check attributes for a tree of elements

    name = element.tag
    if name in element_attributes:
        try:
            pl.check_attribs(element, required_attribs=[], optional_attribs=element_attributes[name])
        except Exception as e:
            print('Error in', name, ':', e)
            raise e
        for child in element:
            check_attributes_rec(child)


def check_graded(element, graded=True):
    # Recursively check if all of an element's children are correctly graded/ungraded
    # Will throw an error if e.g. an ungraded element is put in pl-drawing-answer

    for child in element:
        if child.tag is lxml.etree.Comment or child.tag == 'pl-drawing-group':
            continue

        if child.tag not in graded_elements:
            raise Exception('Element ' + child.tag + ' should not be graded!  Put it inside pl-drawing-initial.')
        check_graded(child, graded)


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    check_attributes_rec(element)

    w_button = None

    prev = not pl.get_boolean_attrib(element, 'gradable', element_defaults['gradable'])

    # Some preparation for elements with grading componenet
    if not prev:
        name = pl.get_string_attrib(element, 'answers-name', None)
        if name is None:
            raise Exception('answers-name is required if gradable mode is enabled')

        n_id = 1
        n_init_elements = 0
        n_ans_elements = 0
        n_control_elements = 0

        for child in element:
            # Get all the objects in pl-drawing-answer
            if child.tag == 'pl-drawing-answer':
                check_graded(child)
                draw_error_box = pl.get_boolean_attrib(child, 'draw-error-box', element_defaults['draw-error-box'])
                ans, n_id = render_drawing_items(child, n_id)
                n_ans_elements += 1
            # Get all the objects in pl-drawing-initial
            if child.tag == 'pl-drawing-initial':
                init, n_id = render_drawing_items(child, n_id)
                n_init_elements += 1
            # Get the width of the vector defined in the pl-drawing-button for pl-vector
            if child.tag == 'pl-controls':
                n_control_elements += 1
                for groups in child:
                    if groups.tag == 'pl-controls-group':
                        for buttons in groups:
                            if buttons.tag == 'pl-drawing-button':
                                pl.check_attribs(buttons, required_attribs=['type'], optional_attribs=['width', 'w1', 'w2', 'anchor_is_tail', 'angle', 'stroke'])
                                if buttons.attrib['type'] == 'pl-vector':
                                    if 'width' in buttons.attrib:
                                        w_button = buttons.attrib['width']
                                    else:
                                        w_button = None

        if n_init_elements > 1:
            raise Exception('You should have only one pl-drawing-initial inside a pl-drawing.')
        if n_ans_elements > 1:
            raise Exception('You should have only one pl-drawing-answer inside a pl-drawing.')
        elif n_ans_elements == 0:
            raise Exception(
                'You do not have any pl-drawing-answer inside pl-drawing where gradable=True. You should either enter the pl-drawing-answer if you want to grade objects, or make gradable=False'
            )

        # Makes sure that all objects in pl-drawing-answer are graded
        # and all the objects in pl-drawing--initial are not graded

        for obj in ans['objects']:
            obj['graded'] = True
            obj['drawErrorBox'] = draw_error_box
            if 'objectDrawErrorBox' in obj:
                if obj['objectDrawErrorBox'] is not None:
                    obj['drawErrorBox'] = obj['objectDrawErrorBox']
            # Check to see if consistent width for pl-vector is used for correct answer
            # and submitted answers that are added using the buttons
            if obj['gradingName'] == 'vector':
                if (w_button is None and obj['width'] == drawing_defaults['force-width']) or obj['width'] == float(w_button):
                    continue
                else:
                    raise Exception('Width is not consistent! pl-vector in pl-drawing-answers needs to have the same width of pl-vector in pl-drawing-button.')

        # Combines all the objects in pl-drawing-answers and pl-drawing-initial
        # and saves in correct_answers
        if n_init_elements != 0:
            for obj in init['objects']:
                obj['graded'] = False
            data['correct_answers'][name] = union_drawing_items(init, ans)
        else:
            data['correct_answers'][name] = ans


def render_controls(template, elem):
    if elem.tag == 'pl-controls':
        markup = ''
        for el in elem:
            if el.tag is lxml.etree.Comment:
                continue
            markup += render_controls(template, el) + '<br>\n'
        return markup
    elif elem.tag == 'pl-drawing-button':
        opts = {format_attrib_name(k): v for k, v in elem.attrib.items() if k != 'type'}
        return chevron.render(template, {'render_button': True, 'button_class': elem.attrib.get('type', ''), 'options': json.dumps(opts)}).strip()
    elif elem.tag == 'pl-controls-group':
        markup = '<p><strong>' + elem.attrib.get('label', '') + '</strong></p>\n<p>'
        for child in elem:
            if child.tag is lxml.etree.Comment:
                continue
            markup += render_controls(template, child) + '\n'
        markup += '</p>\n'
        return markup
    else:
        return 'unknown tag ' + elem.tag


def render_drawing_items(elem, curid=1, defaults={}):
    # Convert a set of drawing items defined as html elements into an array of
    # objects that can be sent to mechanicsObjects.js
    # Some helpers to get attributes from elements.  If there is no default argument passed in,
    # it is assumed that the attribute must be present or else an error will be raised.  If a
    # default is passed, the attribute is optional.

    def attrgetter(cast):
        # Cast is the data type that should be returned

        def f(el, attrib, default=None):
            # Partial function application, thanks Mattox!
            if default is None:
                if attrib in el.attrib:
                    return cast(el.attrib[attrib])
                else:
                    raise Exception('Element ' + el.tag + ' does not have required attribute ' + attrib + '!')
            else:
                return cast(el.attrib.get(attrib, default))

        return f

    def parsebool(string):
        if isinstance(string, bool):
            return string
        return json.loads(string)

    fl_attrib = attrgetter(float)
    st_attrib = attrgetter(str)
    bool_attrib = attrgetter(parsebool)

    # Generate element representations

    def gen_controlledLine(el):
        nonlocal curid

        if 'draw-error-box' in el.attrib:
            obj_draw = el.attrib['draw-error-box'] == 'true'
        else:
            obj_draw = None

        offset_x = fl_attrib(el, 'offset-tol-x', 0)
        offset_y = fl_attrib(el, 'offset-tol-y', 0)
        grid_size = pl.get_integer_attrib(el, 'grid-size', 20)
        tol = pl.get_float_attrib(el, 'tol', grid_size / 2)

        # Defining the error boxes for end points
        wbox = 2 * tol + 2 * offset_x
        hbox = 2 * tol + 2 * offset_y

        obj = {
            'id': curid,
            'x1': fl_attrib(el, 'x1', 20),
            'x2': fl_attrib(el, 'x2', 40),
            'y1': fl_attrib(el, 'y1', 40),
            'y2': fl_attrib(el, 'y2', 40),
            'type': 'controlledLine',
            'stroke': pl.get_color_attrib(el, 'color', 'red'),
            'gradingName': 'controlledLine',
            'strokeWidth': fl_attrib(el, 'stroke-width', 4),
            'handleRadius': fl_attrib(el, 'handle-radius', 6),
            'objectDrawErrorBox': obj_draw,
            'widthErrorBox': wbox,
            'heightErrorBox': hbox,
            'offset_x': offset_x,
            'offset_y': offset_y,
        }
        curid += 1
        return obj

    def gen_controlledCurvedLine(el):
        nonlocal curid

        if 'draw-error-box' in el.attrib:
            obj_draw = el.attrib['draw-error-box'] == 'true'
        else:
            obj_draw = None

        offset_x = fl_attrib(el, 'offset-tol-x', 0)
        offset_y = fl_attrib(el, 'offset-tol-y', 0)
        offset_control_x = fl_attrib(el, 'offset-control-tol-x', 0)
        offset_control_y = fl_attrib(el, 'offset-control-tol-y', 0)
        grid_size = pl.get_integer_attrib(el, 'grid-size', 20)
        tol = pl.get_float_attrib(el, 'tol', grid_size / 2)

        # Defining the error boxes for end points
        wbox = 2 * tol + 2 * offset_x
        hbox = 2 * tol + 2 * offset_y
        # Defining the error box for the control point
        wbox_c = 2 * tol + 2 * offset_control_x
        hbox_c = 2 * tol + 2 * offset_control_y

        obj = {
            'id': curid,
            'x1': fl_attrib(el, 'x1', 20),
            'y1': fl_attrib(el, 'y1', 40),
            'x3': fl_attrib(el, 'x2', 60),
            'y3': fl_attrib(el, 'y2', 40),
            'x2': fl_attrib(el, 'x3', 40),
            'y2': fl_attrib(el, 'y3', 60),
            'type': 'controlledCurvedLine',
            'stroke': pl.get_color_attrib(el, 'color', 'red'),
            'gradingName': 'controlledCurvedLine',
            'strokeWidth': fl_attrib(el, 'stroke-width', 4),
            'handleRadius': fl_attrib(el, 'handle-radius', 6),
            'objectDrawErrorBox': obj_draw,
            'widthErrorBox': wbox,
            'heightErrorBox': hbox,
            'widthErrorBoxControl': wbox_c,
            'heightErrorBoxControl': hbox_c,
            'offset_x': offset_x,
            'offset_y': offset_y,
            'offset_control_x': offset_control_x,
            'offset_control_y': offset_control_y,
        }
        curid += 1
        return obj

    def gen_roller(el):
        nonlocal curid
        color = pl.get_color_attrib(el, 'color', 'brown1')
        stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
        obj = {
            'id': curid,
            'x1': fl_attrib(el, 'x1', drawing_defaults['x1']),
            'y1': fl_attrib(el, 'y1', drawing_defaults['y1']),
            'height': fl_attrib(el, 'height', drawing_defaults['height']),
            'width': fl_attrib(el, 'width', drawing_defaults['width']),
            'angle': fl_attrib(el, 'angle', drawing_defaults['angle']),
            'label': st_attrib(el, 'label', drawing_defaults['label']),
            'offsetx': fl_attrib(el, 'offsetx', drawing_defaults['offsetx']),
            'offsety': fl_attrib(el, 'offsety', drawing_defaults['offsety']),
            'color': color,
            'stroke': stroke_color,
            'strokeWidth': fl_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
            'drawPin': json.loads(st_attrib(el, 'draw-pin', 'true')),
            'drawGround': json.loads(st_attrib(el, 'draw-ground', 'true')),
            'selectable': drawing_defaults['selectable'],
            'evented': drawing_defaults['selectable'],
            'type': 'roller',
            'gradingName': 'roller',
        }
        curid += 1
        return obj

    def gen_clamped(el):
        nonlocal curid
        color = pl.get_color_attrib(el, 'color', 'black')
        obj = {
            'id': curid,
            'x1': fl_attrib(el, 'x1', drawing_defaults['x1']),
            'y1': fl_attrib(el, 'y1', drawing_defaults['y1']),
            'height': fl_attrib(el, 'height', drawing_defaults['height']),
            'width': fl_attrib(el, 'width', drawing_defaults['width']),
            'angle': fl_attrib(el, 'angle', drawing_defaults['angle']),
            'label': st_attrib(el, 'label', drawing_defaults['label']),
            'offsetx': fl_attrib(el, 'offsetx', drawing_defaults['offsetx']),
            'offsety': fl_attrib(el, 'offsety', drawing_defaults['offsety']),
            'color': color,
            'stroke': st_attrib(el, 'stroke-color', 'black'),
            'strokeWidth': fl_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
            'selectable': drawing_defaults['selectable'],
            'evented': drawing_defaults['selectable'],
            'type': 'clamped',
            'gradingName': 'clamped',
        }
        curid += 1
        return obj

    def gen_fixed_pin(el):
        nonlocal curid
        color = pl.get_color_attrib(el, 'color', 'brown1')
        stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
        obj = {
            'id': curid,
            'x1': fl_attrib(el, 'x1', drawing_defaults['x1']),
            'y1': fl_attrib(el, 'y1', drawing_defaults['y1']),
            'height': fl_attrib(el, 'height', drawing_defaults['height']),
            'width': fl_attrib(el, 'width', drawing_defaults['width']),
            'angle': fl_attrib(el, 'angle', drawing_defaults['angle']),
            'label': st_attrib(el, 'label', drawing_defaults['label']),
            'offsetx': fl_attrib(el, 'offsetx', drawing_defaults['offsetx']),
            'offsety': fl_attrib(el, 'offsety', drawing_defaults['offsety']),
            'color': color,
            'stroke': stroke_color,
            'strokeWidth': fl_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
            'drawPin': json.loads(st_attrib(el, 'draw-pin', 'true')),
            'drawGround': json.loads(st_attrib(el, 'draw-ground', 'true')),
            'selectable': drawing_defaults['selectable'],
            'evented': drawing_defaults['selectable'],
            'type': 'fixed-pin',
            'gradingName': 'fixed-pin',
        }
        curid += 1
        return obj

    def gen_rod(el):
        nonlocal curid
        color = pl.get_color_attrib(el, 'color', 'white')
        stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
        obj = {
            'id': curid,
            'height': fl_attrib(el, 'width', drawing_defaults['width-rod']),
            'x1': fl_attrib(el, 'x1', drawing_defaults['x1']),
            'y1': fl_attrib(el, 'y1', drawing_defaults['y1']),
            'label1': st_attrib(el, 'label1', drawing_defaults['label']),
            'offsetx1': fl_attrib(el, 'offsetx1', drawing_defaults['offsetx']),
            'offsety1': fl_attrib(el, 'offsety1', drawing_defaults['offsety']),
            'x2': fl_attrib(el, 'x2', drawing_defaults['x2']),
            'y2': fl_attrib(el, 'y2', drawing_defaults['y2']),
            'label2': st_attrib(el, 'label2', drawing_defaults['label']),
            'offsetx2': fl_attrib(el, 'offsetx2', drawing_defaults['offsetx']),
            'offsety2': fl_attrib(el, 'offsety2', drawing_defaults['offsety']),
            'color': color,
            'stroke': stroke_color,
            'strokeWidth': fl_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
            'drawPin': json.loads(st_attrib(el, 'draw-pin', 'true')),
            'selectable': drawing_defaults['selectable'],
            'evented': drawing_defaults['selectable'],
            'type': 'rod',
            'gradingName': 'rod',
        }
        curid += 1
        return obj

    def gen_collarrod(el):
        nonlocal curid
        w = fl_attrib(el, 'width', 20)
        color = pl.get_color_attrib(el, 'color', 'white')
        stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
        obj = {
            'id': curid,
            'height': w,
            'x1': fl_attrib(el, 'x1', 40),
            'y1': fl_attrib(el, 'y1', 40),
            'collar1': bool_attrib(el, 'draw-collar-end1', True),
            'w1': fl_attrib(el, 'w1', 1.5 * w),
            'h1': fl_attrib(el, 'h1', 2 * w),
            'label1': st_attrib(el, 'label1', ''),
            'offsetx1': fl_attrib(el, 'offsetx1', 2),
            'offsety1': fl_attrib(el, 'offsety1', 2),
            'x2': fl_attrib(el, 'x2', 100),
            'y2': fl_attrib(el, 'y2', 40),
            'w2': fl_attrib(el, 'w2', 1.5 * w),
            'h2': fl_attrib(el, 'h2', 2 * w),
            'collar2': bool_attrib(el, 'draw-collar-end2', False),
            'label2': st_attrib(el, 'label2', ''),
            'offsetx2': fl_attrib(el, 'offsetx2', 2),
            'offsety2': fl_attrib(el, 'offsety2', 2),
            'color': color,
            'stroke': stroke_color,
            'strokeWidth': fl_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
            'drawPin': json.loads(st_attrib(el, 'draw-pin', 'true')),
            'selectable': drawing_defaults['selectable'],
            'evented': drawing_defaults['selectable'],
            'type': 'collarrod',
            'gradingName': 'collarrod',
        }
        curid += 1
        return obj

    def gen_3pointrod(el):
        nonlocal curid
        color = pl.get_color_attrib(el, 'color', 'white')
        stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
        x1 = fl_attrib(el, 'x1', 40)
        y1 = fl_attrib(el, 'y1', 100)
        x2 = fl_attrib(el, 'x2', 100)
        y2 = fl_attrib(el, 'y2', 100)
        x3 = fl_attrib(el, 'x3', 100)
        y3 = fl_attrib(el, 'y3', 140)
        rC = np.array([x1, y1])
        rA = np.array([x2, y2])
        rB = np.array([x3, y3])
        uCA = rA - rC
        L1 = la.norm(uCA, 2)
        e1 = uCA / L1
        e2 = np.array([-e1[1], e1[0]])
        uCB = rB - rC
        uAB = uCB - uCA
        L2 = la.norm(uAB, 2)
        alpha_rad = math.atan2(e1[1], e1[0])
        alpha = alpha_rad * 180 / math.pi
        beta = math.atan2(np.inner(uAB, e2), np.inner(uAB, e1))
        obj = {
            'id': curid,
            'height': fl_attrib(el, 'width', 20),
            'x1': x1,
            'y1': y1,
            'x2': x2,
            'y2': y2,
            'x3': x3,
            'y3': y3,
            'length1': L1,
            'length2': L2,
            'angle': alpha,
            'angle2': beta,
            'label1': st_attrib(el, 'label1', ''),
            'offsetx1': fl_attrib(el, 'offsetx1', 0),
            'offsety1': fl_attrib(el, 'offsety1', -20),
            'label2': st_attrib(el, 'label2', ''),
            'offsetx2': fl_attrib(el, 'offsetx2', 0),
            'offsety2': fl_attrib(el, 'offsety2', -20),
            'label3': st_attrib(el, 'label3', ''),
            'offsetx3': fl_attrib(el, 'offsetx3', 0),
            'offsety3': fl_attrib(el, 'offsety3', -20),
            'color': color,
            'stroke': stroke_color,
            'strokeWidth': fl_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
            'drawPin': json.loads(st_attrib(el, 'draw-pin', 'true')),
            'selectable': drawing_defaults['selectable'],
            'evented': drawing_defaults['selectable'],
            'type': 'Lshaperod',
            'gradingName': 'Lshaperod',
        }
        curid += 1
        return obj

    def gen_4pointrod(el):
        nonlocal curid
        color = pl.get_color_attrib(el, 'color', 'white')
        stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
        x1 = fl_attrib(el, 'x1', 40)
        y1 = fl_attrib(el, 'y1', 100)
        x2 = fl_attrib(el, 'x2', 100)
        y2 = fl_attrib(el, 'y2', 100)
        x3 = fl_attrib(el, 'x3', 100)
        y3 = fl_attrib(el, 'y3', 160)
        x4 = fl_attrib(el, 'x4', 140)
        y4 = fl_attrib(el, 'y4', 60)
        rP = np.array([x1, y1])
        rQ = np.array([x2, y2])

        uPQ = rQ - rP
        L1 = la.norm(uPQ, 2)
        n1 = uPQ / L1
        n2 = np.array([-n1[1], n1[0]])
        alpha_rad = math.atan2(n1[1], n1[0])
        alpha = alpha_rad * 180 / math.pi

        # Assume first given point is R and second point is S
        rR = np.array([x3, y3])
        rS = np.array([x4, y4])
        uQR = rR - rQ
        uQS = rS - rQ
        L2 = la.norm(uQR, 2)
        L3 = la.norm(uQS, 2)
        beta = math.atan2(np.inner(uQR, n2), np.inner(uQR, n1))
        # print('beta =', beta*180/math.pi)
        gamma = math.atan2(np.inner(uQS, n2), np.inner(uQS, n1))
        # print('gamma =',gamma*180/math.pi)

        if beta * gamma >= 0:
            if beta < gamma:
                temp = gamma
                gamma = beta
                beta = temp
                temp = L2
                L2 = L3
                L3 = temp

        obj = {
            'id': curid,
            'height': fl_attrib(el, 'width', 20),
            'x1': x1,
            'y1': y1,
            'x2': x2,
            'y2': y2,
            'x3': x3,
            'y3': y3,
            'x4': x4,
            'y4': y4,
            'length1': L1,
            'length2': L2,
            'length3': L3,
            'angle': alpha,
            'angle2': beta,
            'angle3': gamma,
            'label1': st_attrib(el, 'label1', ''),
            'offsetx1': fl_attrib(el, 'offsetx1', 0),
            'offsety1': fl_attrib(el, 'offsety1', -20),
            'label2': st_attrib(el, 'label2', ''),
            'offsetx2': fl_attrib(el, 'offsetx2', 0),
            'offsety2': fl_attrib(el, 'offsety2', -20),
            'label3': st_attrib(el, 'label3', ''),
            'offsetx3': fl_attrib(el, 'offsetx3', 0),
            'offsety3': fl_attrib(el, 'offsety3', -20),
            'label4': st_attrib(el, 'label4', ''),
            'offsetx4': fl_attrib(el, 'offsetx4', 0),
            'offsety4': fl_attrib(el, 'offsety4', -20),
            'color': color,
            'stroke': stroke_color,
            'strokeWidth': fl_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
            'drawPin': json.loads(st_attrib(el, 'draw-pin', 'true')),
            'selectable': drawing_defaults['selectable'],
            'evented': drawing_defaults['selectable'],
            'type': 'Tshaperod',
            'gradingName': 'Tshaperod',
        }
        curid += 1
        return obj

    def gen_pulley(el):
        nonlocal curid
        color = pl.get_color_attrib(el, 'color', 'gray')
        stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
        r = fl_attrib(el, 'radius', 20)
        x1 = fl_attrib(el, 'x1', 100)
        y1 = fl_attrib(el, 'y1', 100)
        x2 = fl_attrib(el, 'x2', 140)
        y2 = fl_attrib(el, 'y2', 140)
        x3 = fl_attrib(el, 'x3', 40)
        y3 = fl_attrib(el, 'y3', 130)
        uO = np.array([x1, y1])
        uA = np.array([x2, y2])
        uB = np.array([x3, y3])
        longer = bool_attrib(el, 'alternative-path', 'false')

        uOA = uA - uO
        dOA = la.norm(uOA, 2)
        n1 = uOA / dOA
        n2 = np.array([n1[1], -n1[0]])
        theta = math.asin(r / dOA)
        p1 = r * math.sin(theta) * n1 + r * math.cos(theta) * n2
        p2 = r * math.sin(theta) * n1 - r * math.cos(theta) * n2

        uOB = uB - uO
        dOB = la.norm(uOB, 2)
        n3 = uOB / dOB
        n4 = np.array([n3[1], -n3[0]])
        theta2 = math.asin(r / dOB)
        p3 = r * math.sin(theta2) * n3 + r * math.cos(theta2) * n4
        p4 = r * math.sin(theta2) * n3 - r * math.cos(theta2) * n4

        if not longer:
            p = p2 if np.inner(n2, uOB) > 0 else p1
            u4 = uO + p
            u5 = uO + p3 if la.norm(p3 - uOA, 2) > la.norm(p - uOA, 2) else uO + p4
        else:
            p = p2 if np.inner(n2, uOB) < 0 else p1
            u4 = uO + p
            u5 = uO + p3 if la.norm(p3 - uOA, 2) < la.norm(p - uOA, 2) else uO + p4

        obj = {
            'id': curid,
            'x1': x1,
            'y1': y1,
            'x2': x2,
            'y2': y2,
            'x3': x3,
            'y3': y3,
            'x4': u4[0],
            'y4': u4[1],
            'x5': u5[0],
            'y5': u5[1],
            'radius': r,
            'label': st_attrib(el, 'label', ''),
            'offsetx': fl_attrib(el, 'offsetx', 2),
            'offsety': fl_attrib(el, 'offsety', 2),
            'stroke': stroke_color,
            'strokeWidth': fl_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
            'fill': color,
            'type': 'pulley',
            'gradingName': 'pulley',
        }
        curid += 1
        return obj

    def gen_vector(el):
        nonlocal curid
        color = pl.get_color_attrib(el, 'color', 'red3')
        anchor_is_tail = bool_attrib(el, 'anchor-is-tail', True)
        # This is the anchor point for Grading
        x1 = fl_attrib(el, 'x1', 30)
        y1 = fl_attrib(el, 'y1', 10)
        # This is the end point used for plotting
        left = x1
        top = y1
        w = fl_attrib(el, 'width', drawing_defaults['force-width'])
        angle = fl_attrib(el, 'angle', 0)
        theta = angle * math.pi / 180
        if not anchor_is_tail:
            left -= w * math.cos(theta)
            top -= w * math.sin(theta)
        # Error box for grading
        disregard_sense = bool_attrib(el, 'disregard-sense', False)
        if disregard_sense:
            offset_forward_default = w
        else:
            offset_forward_default = 0
        offset_forward = fl_attrib(el, 'offset-forward', offset_forward_default)
        offset_backward = fl_attrib(el, 'offset-backward', w)

        grid_size = pl.get_integer_attrib(el, 'grid-size', 20)
        tol = pl.get_float_attrib(el, 'tol', grid_size / 2)
        pc, hbox, wbox, _, _ = get_error_box(x1, y1, theta, tol, offset_forward, offset_backward)

        if 'draw-error-box' in el.attrib:
            obj_draw = el.attrib['draw-error-box'] == 'true'
        else:
            obj_draw = None

        obj = {
            'id': curid,
            'left': left,
            'top': top,
            'x1': x1,
            'y1': y1,
            'width': w,
            'angle': angle,
            'label': st_attrib(el, 'label', ''),
            'offsetx': fl_attrib(el, 'offsetx', 2),
            'offsety': fl_attrib(el, 'offsety', 2),
            'stroke': color,
            'strokeWidth': fl_attrib(el, 'stroke-width', 3),
            'arrowheadWidthRatio': fl_attrib(el, 'arrow-head-width', 1),
            'arrowheadOffsetRatio': fl_attrib(el, 'arrow-head-length', 1),
            'drawStartArrow': False,
            'drawEndArrow': True,
            'originY': 'center',
            'trueHandles': ['mtr'],
            'disregard_sense': disregard_sense,
            'optional_grading': bool_attrib(el, 'optional-grading', False),
            'objectDrawErrorBox': obj_draw,
            'XcenterErrorBox': pc[0] if pc is not None else pc,
            'YcenterErrorBox': pc[1] if pc is not None else pc,
            'widthErrorBox': wbox,
            'heightErrorBox': hbox,
            'offset_forward': offset_forward,
            'offset_backward': offset_backward,
            'selectable': drawing_defaults['selectable'],
            'evented': drawing_defaults['selectable'],
            'type': 'arrow',
            'gradingName': 'vector',
        }
        curid += 1
        return obj

    def gen_double_headed_vector(el):
        obj = gen_vector(el)
        obj['type'] = 'doubleArrow'
        obj['gradingName'] = 'double_headed_vector'
        return obj

    def gen_arc_vector(el):
        nonlocal curid
        disregard_sense = bool_attrib(el, 'disregard-sense', False)
        color = pl.get_color_attrib(el, 'color', 'purple')
        clockwise_direction = bool_attrib(el, 'clockwise-direction', True)
        if clockwise_direction:
            drawStartArrow = False
            drawEndArrow = True
        else:
            drawStartArrow = True
            drawEndArrow = False
        # Error box for grading
        x1 = fl_attrib(el, 'x1', 40)
        y1 = fl_attrib(el, 'y1', 40)

        if 'draw-error-box' in el.attrib:
            obj_draw = el.attrib['draw-error-box'] == 'true'
        else:
            obj_draw = None

        offset_forward = fl_attrib(el, 'offset-forward', 0)
        offset_backward = fl_attrib(el, 'offset-backward', 0)

        grid_size = pl.get_integer_attrib(el, 'grid-size', 20)
        tol = pl.get_float_attrib(el, 'tol', grid_size / 2)
        pc, hbox, wbox, _, _ = get_error_box(x1, y1, 0, tol, offset_forward, offset_backward)

        obj = {
            'id': curid,
            'left': x1,
            'top': y1,
            'angle': 0,
            'radius': fl_attrib(el, 'radius', 30),
            'startAngle': fl_attrib(el, 'start-angle', 0),
            'endAngle': fl_attrib(el, 'end-angle', 210),
            'drawCenterPoint': json.loads(st_attrib(el, 'draw-center', 'true')),
            'drawStartArrow': drawStartArrow,
            'drawEndArrow': drawEndArrow,
            'label': st_attrib(el, 'label', ''),
            'offsetx': fl_attrib(el, 'offsetx', 0),
            'offsety': fl_attrib(el, 'offsety', 0),
            'stroke': color,
            'fill': color,
            'strokeWidth': fl_attrib(el, 'stroke-width', 3),
            'arrowheadWidthRatio': fl_attrib(el, 'arrow-head-width', 1),
            'arrowheadOffsetRatio': fl_attrib(el, 'arrow-head-length', 1),
            'disregard_sense': disregard_sense,
            'optional_grading': bool_attrib(el, 'optional-grading', False),
            'objectDrawErrorBox': obj_draw,
            'XcenterErrorBox': pc[0] if pc is not None else pc,
            'YcenterErrorBox': pc[1] if pc is not None else pc,
            'widthErrorBox': wbox,
            'heightErrorBox': hbox,
            'offset_forward': offset_forward,
            'offset_backward': offset_backward,
            'originY': 'center',
            'selectable': drawing_defaults['selectable'],
            'type': 'arc_vector',
            'gradingName': 'arc_vector',
        }
        curid += 1
        return obj

    def gen_distributed_force(el):
        nonlocal curid
        color = pl.get_color_attrib(el, 'color', 'red3')
        anchor_is_tail = bool_attrib(el, 'anchor-is-tail', True)
        # This is the anchor point for Grading
        x1 = fl_attrib(el, 'x1', 30)
        y1 = fl_attrib(el, 'y1', 10)
        # This is the end point used for plotting
        left = x1
        top = y1
        w = fl_attrib(el, 'width', drawing_defaults['force-width'])
        w1 = fl_attrib(el, 'w1', drawing_defaults['force-width'])
        w2 = fl_attrib(el, 'w2', drawing_defaults['force-width'])
        wmax = max(w1, w2)
        angle = fl_attrib(el, 'angle', 0)
        theta = angle * math.pi / 180
        if not anchor_is_tail:
            left += wmax * math.sin(theta)
            top -= wmax * math.cos(theta)
        # Error box for grading
        disregard_sense = bool_attrib(el, 'disregard-sense', False)
        if disregard_sense:
            offset_forward_default = 1.1 * wmax
        else:
            offset_forward_default = 0
        offset_forward = fl_attrib(el, 'offset-forward', offset_forward_default)
        offset_backward = fl_attrib(el, 'offset-backward', 1.1 * wmax)

        grid_size = pl.get_integer_attrib(el, 'grid-size', 20)
        tol = pl.get_float_attrib(el, 'tol', grid_size / 2)
        pc, wbox, hbox, _, _ = get_error_box(x1, y1, theta + math.pi / 2, tol, offset_forward, offset_backward)

        if 'draw-error-box' in el.attrib:
            obj_draw = el.attrib['draw-error-box'] == 'true'
        else:
            obj_draw = None

        obj = {
            'id': curid,
            'left': left,
            'top': top,
            'x1': x1,
            'y1': y1,
            'angle': angle,
            'range': w,
            'spacing': fl_attrib(el, 'spacing', 20),
            'w1': w1,
            'w2': w2,
            'label1': st_attrib(el, 'label1', ''),
            'offsetx1': fl_attrib(el, 'offsetx1', 2),
            'offsety1': fl_attrib(el, 'offsety1', 2),
            'label2': st_attrib(el, 'label2', ''),
            'offsetx2': fl_attrib(el, 'offsetx2', 2),
            'offsety2': fl_attrib(el, 'offsety2', 2),
            'label': st_attrib(el, 'label', ''),
            'offsetx': fl_attrib(el, 'offsetx', 2),
            'offsety': fl_attrib(el, 'offsety', 2),
            'stroke': color,
            'strokeWidth': fl_attrib(el, 'stroke-width', 3),
            'arrowheadWidthRatio': fl_attrib(el, 'arrow-head-width', 2),
            'arrowheadOffsetRatio': fl_attrib(el, 'arrow-head-length', 3),
            'drawStartArrow': False,
            'drawEndArrow': True,
            'anchor_is_tail': st_attrib(el, 'anchor-is-tail', 'true'),
            'trueHandles': ['mtr'],
            'disregard_sense': disregard_sense,
            'optional_grading': bool_attrib(el, 'optional-grading', False),
            'objectDrawErrorBox': obj_draw,
            'XcenterErrorBox': pc[0] if pc is not None else pc,
            'YcenterErrorBox': pc[1] if pc is not None else pc,
            'widthErrorBox': wbox,
            'heightErrorBox': hbox,
            'offset_forward': offset_forward,
            'offset_backward': offset_backward,
            'selectable': drawing_defaults['selectable'],
            'type': 'distTrianLoad',
            'gradingName': 'distTrianLoad',
        }
        curid += 1
        return obj

    def gen_point(el):
        nonlocal curid
        color = pl.get_color_attrib(el, 'color', 'black')
        # Error box for grading
        x1 = fl_attrib(el, 'x1', 40)
        y1 = fl_attrib(el, 'y1', 40)

        if 'draw-error-box' in el.attrib:
            obj_draw = el.attrib['draw-error-box'] == 'true'
        else:
            obj_draw = None

        offset_forward = fl_attrib(el, 'offset-forward', 0)
        offset_backward = fl_attrib(el, 'offset-backward', 0)

        grid_size = pl.get_integer_attrib(el, 'grid-size', 20)
        tol = pl.get_float_attrib(el, 'tol', grid_size / 2)
        pc, hbox, wbox, _, _ = get_error_box(x1, y1, 0, tol, offset_forward, offset_backward)

        obj = {
            'id': curid,
            'left': fl_attrib(el, 'x1', 20),
            'top': fl_attrib(el, 'y1', 20),
            'radius': fl_attrib(el, 'radius', drawing_defaults['point-size']),
            'objectDrawErrorBox': obj_draw,
            'XcenterErrorBox': pc[0] if pc is not None else pc,
            'YcenterErrorBox': pc[1] if pc is not None else pc,
            'widthErrorBox': wbox,
            'heightErrorBox': hbox,
            'offset_forward': offset_forward,
            'offset_backward': offset_backward,
            'label': st_attrib(el, 'label', drawing_defaults['label']),
            'offsetx': fl_attrib(el, 'offsetx', 5),
            'offsety': fl_attrib(el, 'offsety', 5),
            'originX': 'center',
            'originY': 'center',
            'fill': color,
            'selectable': drawing_defaults['selectable'],
            'evented': drawing_defaults['selectable'],
            'type': 'circle',
            'gradingName': 'point',
        }
        curid += 1
        return obj

    def gen_coordinates(el):
        nonlocal curid
        color = pl.get_color_attrib(el, 'color', 'black')
        obj = {
            'id': curid,
            'left': fl_attrib(el, 'x1', drawing_defaults['x1']),
            'top': fl_attrib(el, 'y1', drawing_defaults['y1']),
            'width': fl_attrib(el, 'width', drawing_defaults['width']),
            'label': st_attrib(el, 'label', ''),
            'offsetx': fl_attrib(el, 'offsetx', -16),
            'offsety': fl_attrib(el, 'offsety', -10),
            'labelx': st_attrib(el, 'label-x', 'x'),
            'labely': st_attrib(el, 'label-y', 'y'),
            'offsetx_label_x': fl_attrib(el, 'offsetx-label-x', 0),
            'offsety_label_x': fl_attrib(el, 'offsety-label-x', 0),
            'offsetx_label_y': fl_attrib(el, 'offsetx-label-y', -20),
            'offsety_label_y': fl_attrib(el, 'offsety-label-y', -10),
            'stroke': color,
            'strokeWidth': fl_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
            'angle': fl_attrib(el, 'angle', 0),
            'arrowheadWidthRatio': fl_attrib(el, 'arrow-head-width', 1),
            'arrowheadOffsetRatio': fl_attrib(el, 'arrow-head-length', 1),
            'drawStartArrow': False,
            'drawEndArrow': True,
            'originY': 'center',
            'selectable': drawing_defaults['selectable'],
            'type': 'coordinates',
            'gradingName': 'coordinates',
        }
        curid += 1
        return obj

    def gen_dimensions(el):
        nonlocal curid
        color = pl.get_color_attrib(el, 'stroke-color', 'black')
        offset = fl_attrib(el, 'dim-offset', 0)
        x1 = fl_attrib(el, 'x1', drawing_defaults['x1'])
        y1 = fl_attrib(el, 'y1', drawing_defaults['y1'])
        if 'x2' not in el.attrib:
            w = fl_attrib(el, 'width', drawing_defaults['force-width'] / 2)
            ang = fl_attrib(el, 'angle', drawing_defaults['angle'])
            ang_rad = ang * math.pi / 180
            x2 = x1 + w * math.cos(ang_rad)
            y2 = y1 + w * math.sin(ang_rad)
        else:
            x2 = fl_attrib(el, 'x2')
            y2 = fl_attrib(el, 'y2', y1)
            ang_rad = math.atan2(y2 - y1, x2 - x1)

        if 'dim-offset-angle' in el.attrib:
            ang = fl_attrib(el, 'dim-offset-angle')
            ang_rad = ang * math.pi / 180

        e1 = np.array([math.cos(ang_rad), math.sin(ang_rad)])
        e2 = np.array([-math.sin(ang_rad), math.cos(ang_rad)])
        r1 = np.array([x1, y1])
        r2 = np.array([x2, y2])
        r12 = r2 - r1

        r1d = r1 + offset * e2
        r2d = r1d + np.inner(r12, e1) * e1
        rlabel = r1d + 0.5 * np.inner(r12, e1) * e1 + 10 * e2

        obj = {
            'id': curid,
            'x1ref': x1,
            'y1ref': y1,
            'x2ref': x2,
            'y2ref': y2,
            'x1d': float(r1d[0]),
            'y1d': float(r1d[1]),
            'x2d': float(r2d[0]),
            'y2d': float(r2d[1]),
            'stroke': color,
            'strokeWidth': fl_attrib(el, 'stroke-width', drawing_defaults['stroke-width'] / 2),
            'arrowheadWidthRatio': fl_attrib(el, 'arrow-head-width', 1.5),
            'arrowheadOffsetRatio': fl_attrib(el, 'arrow-head-length', 1.5),
            'label': st_attrib(el, 'label', ''),
            'offsetx': fl_attrib(el, 'offsetx', 0),
            'offsety': fl_attrib(el, 'offsety', 0),
            'xlabel': float(rlabel[0]),
            'ylabel': float(rlabel[1]),
            'drawStartArrow': json.loads(st_attrib(el, 'draw-start-arrow', 'true')),
            'drawEndArrow': json.loads(st_attrib(el, 'draw-end-arrow', 'true')),
            'startSupportLine': bool_attrib(el, 'start-support-line', False),
            'endSupportLine': bool_attrib(el, 'end-support-line', False),
            'originY': 'center',
            'selectable': drawing_defaults['selectable'],
            'type': 'dimension',
            'gradingName': 'dimension',
        }
        curid += 1
        return obj

    def gen_arc_dimension(el):
        nonlocal curid
        color = pl.get_color_attrib(el, 'stroke-color', 'black')
        obj = {
            'id': curid,
            'left': fl_attrib(el, 'x1', drawing_defaults['x1']),
            'top': fl_attrib(el, 'y1', drawing_defaults['y1']),
            'angle': fl_attrib(el, 'angle', drawing_defaults['angle']),
            'radius': fl_attrib(el, 'radius', drawing_defaults['radius']),
            'startAngle': fl_attrib(el, 'start-angle', drawing_defaults['angle']),
            'endAngle': fl_attrib(el, 'end-angle', drawing_defaults['end-angle']),
            'drawCenterPoint': bool_attrib(el, 'draw-center', False),
            'drawStartArrow': bool_attrib(el, 'draw-start-arrow', False),
            'drawEndArrow': bool_attrib(el, 'draw-end-arrow', True),
            'startSupportLine': bool_attrib(el, 'start-support-line', False),
            'endSupportLine': bool_attrib(el, 'end-support-line', False),
            'label': st_attrib(el, 'label', drawing_defaults['label']),
            'offsetx': fl_attrib(el, 'offsetx', 0),
            'offsety': fl_attrib(el, 'offsety', 0),
            'stroke': color,
            'fill': color,
            'strokeWidth': fl_attrib(el, 'stroke-width', drawing_defaults['stroke-width'] / 2),
            'arrowheadWidthRatio': fl_attrib(el, 'arrow-head-width', 1),
            'arrowheadOffsetRatio': fl_attrib(el, 'arrow-head-length', 1),
            'originY': 'center',
            'selectable': drawing_defaults['selectable'],
            'evented': drawing_defaults['selectable'],
            'type': 'arc-dimension',
            'gradingName': 'arc_dimension',
        }
        curid += 1
        return obj

    def gen_rectangle(el):
        nonlocal curid
        color = pl.get_color_attrib(el, 'color', 'green1')
        stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
        obj = {
            'id': curid,
            'left': fl_attrib(el, 'x1', drawing_defaults['x1']),
            'top': fl_attrib(el, 'y1', drawing_defaults['y1']),
            'width': fl_attrib(el, 'width', drawing_defaults['width']),
            'height': fl_attrib(el, 'height', drawing_defaults['height']),
            'angle': fl_attrib(el, 'angle', drawing_defaults['angle']),
            'originX': 'center',
            'originY': 'center',
            'fill': color,
            'stroke': stroke_color,
            'strokeWidth': fl_attrib(el, 'stroke-width', drawing_defaults['stroke-width'] / 2),
            'type': 'rectangle',
            'gradingName': 'rectangle',
            'selectable': bool_attrib(el, 'selectable', drawing_defaults['selectable']),
            'evented': bool_attrib(el, 'selectable', drawing_defaults['selectable']),
        }
        curid += 1
        return obj

    def gen_triangle(el):
        nonlocal curid
        color = pl.get_color_attrib(el, 'color', 'red1')
        stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
        obj = {
            'id': curid,
            'p1': {'x': fl_attrib(el, 'x1', 40), 'y': fl_attrib(el, 'y1', 40)},
            'p2': {'x': fl_attrib(el, 'x2', 60), 'y': fl_attrib(el, 'y2', 40)},
            'p3': {'x': fl_attrib(el, 'x3', 40), 'y': fl_attrib(el, 'y3', 20)},
            'fill': color,
            'stroke': stroke_color,
            'strokeWidth': fl_attrib(el, 'stroke-width', drawing_defaults['stroke-width'] / 2),
            'type': 'triangle',
            'gradingName': 'triangle',
            'selectable': bool_attrib(el, 'selectable', drawing_defaults['selectable']),
            'evented': bool_attrib(el, 'selectable', drawing_defaults['selectable']),
        }
        curid += 1
        return obj

    def gen_circle(el):
        nonlocal curid
        color = pl.get_color_attrib(el, 'color', 'grey')
        stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
        obj = {
            'id': curid,
            'left': fl_attrib(el, 'x1', drawing_defaults['x1']),
            'top': fl_attrib(el, 'y1', drawing_defaults['y1']),
            'radius': fl_attrib(el, 'radius', drawing_defaults['radius']),
            'label': st_attrib(el, 'label', drawing_defaults['label']),
            'offsetx': fl_attrib(el, 'offsetx', 5),
            'offsety': fl_attrib(el, 'offsety', 5),
            'originX': 'center',
            'originY': 'center',
            'stroke': stroke_color,
            'fill': color,
            'strokeWidth': fl_attrib(el, 'stroke-width', drawing_defaults['stroke-width'] / 2),
            'selectable': bool_attrib(el, 'selectable', drawing_defaults['selectable']),
            'evented': bool_attrib(el, 'selectable', drawing_defaults['selectable']),
            'type': 'circle',
            'gradingName': 'circle',
        }
        curid += 1
        return obj

    def gen_polygon(el):
        nonlocal curid
        pointlist = json.loads(st_attrib(el, 'plist', '{}'))
        color = pl.get_color_attrib(el, 'color', 'white')
        stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
        obj = {
            'id': curid,
            'pointlist': pointlist,
            'fill': color,
            'stroke': stroke_color,
            'strokeWidth': fl_attrib(el, 'stroke-width', 1),
            'type': 'polygon',
            'gradingName': 'polygon',
            'selectable': bool_attrib(el, 'selectable', drawing_defaults['selectable']),
            'evented': bool_attrib(el, 'selectable', drawing_defaults['selectable']),
        }
        curid += 1
        return obj

    def gen_spring(el):
        nonlocal curid
        stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
        x1 = fl_attrib(el, 'x1', drawing_defaults['x1'])
        y1 = fl_attrib(el, 'y1', drawing_defaults['y1'])
        if 'x2' in el.attrib and 'y2' in el.attrib:
            x2 = fl_attrib(el, 'x2')
            y2 = fl_attrib(el, 'y2')
        else:
            w = fl_attrib(el, 'width', drawing_defaults['force-width'])
            angle = fl_attrib(el, 'angle', drawing_defaults['angle'])
            x2 = x1 + w * math.cos(angle * math.pi / 180)
            y2 = y1 + w * math.sin(angle * math.pi / 180)
        obj = {
            'id': curid,
            'x1': x1,
            'y1': y1,
            'x2': x2,
            'y2': y2,
            'height': fl_attrib(el, 'height', drawing_defaults['height']),
            'dx': fl_attrib(el, 'interval', 10),
            'originX': 'center',
            'originY': 'center',
            'stroke': stroke_color,
            'strokeWidth': fl_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
            'drawPin': bool_attrib(el, 'draw-pin', False),
            'selectable': drawing_defaults['selectable'],
            'evented': drawing_defaults['selectable'],
            'type': 'spring',
            'gradingName': 'spring',
        }
        curid += 1
        return obj

    def gen_line(el):
        nonlocal curid
        stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
        x1 = fl_attrib(el, 'x1', drawing_defaults['x1'])
        y1 = fl_attrib(el, 'y1', drawing_defaults['y1'])
        if 'x2' in el.attrib and 'y2' in el.attrib:
            x2 = fl_attrib(el, 'x2')
            y2 = fl_attrib(el, 'y2')
        else:
            w = fl_attrib(el, 'width', drawing_defaults['force-width'])
            angle = fl_attrib(el, 'angle', 0)
            x2 = x1 + w * math.cos(angle * math.pi / 180)
            y2 = y1 + w * math.sin(angle * math.pi / 180)
        if 'dashed-size' in el.attrib:
            dashed_array = [fl_attrib(el, 'dashed-size'), fl_attrib(el, 'dashed-size')]
        else:
            dashed_array = None
        obj = {
            'id': curid,
            'x1': x1,
            'y1': y1,
            'x2': x2,
            'y2': y2,
            'originX': 'center',
            'originY': 'center',
            'stroke': stroke_color,
            'strokeWidth': fl_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
            'strokeDashArray': dashed_array,
            'selectable': drawing_defaults['selectable'],
            'evented': drawing_defaults['selectable'],
            'type': 'line',
            'gradingName': 'line',
        }
        curid += 1
        return obj

    def gen_arc(el):
        nonlocal curid
        stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
        theta1 = fl_attrib(el, 'start-angle', drawing_defaults['angle']) * math.pi / 180
        theta2 = fl_attrib(el, 'end-angle', drawing_defaults['end-angle']) * math.pi / 180
        if 'dashed-size' in el.attrib:
            dashed_array = [fl_attrib(el, 'dashed-size'), fl_attrib(el, 'dashed-size')]
        else:
            dashed_array = None
        obj = {
            'id': curid,
            'left': fl_attrib(el, 'x1', drawing_defaults['x1']),
            'top': fl_attrib(el, 'y1', drawing_defaults['y1']),
            'radius': fl_attrib(el, 'radius', drawing_defaults['radius']),
            'startAngle': theta1,
            'endAngle': theta2,
            'stroke': stroke_color,
            'strokeWidth': fl_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
            'strokeDashArray': dashed_array,
            'fill': '',
            'selectable': drawing_defaults['selectable'],
            'evented': drawing_defaults['selectable'],
            'originX': 'center',
            'originY': 'center',
            'type': 'simple-arc',
            'gradingName': 'simple-arc',
        }
        curid += 1
        return obj

    def gen_text(el):
        nonlocal curid
        obj = {
            'id': curid,
            'left': fl_attrib(el, 'x1', drawing_defaults['x1']),
            'top': fl_attrib(el, 'y1', drawing_defaults['y1']),
            'label': st_attrib(el, 'label', ' Text '),
            'offsetx': fl_attrib(el, 'offsetx', 0),
            'offsety': fl_attrib(el, 'offsety', 0),
            'fontSize': fl_attrib(el, 'font-size', drawing_defaults['font-size']),
            'latex': bool_attrib(el, 'latex', True),
            'type': 'text',
            'gradingName': 'text',
        }
        curid += 1
        return obj

    def gen_axes(el):
        nonlocal curid
        if 'origin' in el.attrib:
            origin = json.loads(st_attrib(el, 'origin'))
            origin_x = origin['x']
            origin_y = origin['y']
        else:
            origin_x = origin_y = 60

        color = pl.get_color_attrib(el, 'color', 'black')
        obj = {
            'id': curid,
            'left': origin_x,
            'top': origin_y,
            'xneg': fl_attrib(el, 'xneg', 20),
            'xpos': fl_attrib(el, 'xpos', 400),
            'yneg': fl_attrib(el, 'yneg', 160),
            'ypos': fl_attrib(el, 'ypos', 160),
            'supporting_lines': json.loads(st_attrib(el, 'supporting-lines', '{}')),
            'label_list': json.loads(st_attrib(el, 'grid-label', '{}')),
            'labelx': st_attrib(el, 'label-x', 'x'),
            'labely': st_attrib(el, 'label-y', 'y'),
            'offsetx_label_x': fl_attrib(el, 'offsetx-label-x', 0),
            'offsety_label_x': fl_attrib(el, 'offsety-label-x', 0),
            'offsetx_label_y': fl_attrib(el, 'offsetx-label-y', -30),
            'offsety_label_y': fl_attrib(el, 'offsety-label-y', -10),
            'stroke': color,
            'strokeWidth': fl_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
            'originY': 'center',
            'selectable': drawing_defaults['selectable'],
            'evented': drawing_defaults['selectable'],
            'type': 'axes',
            'gradingName': 'axes',
        }
        curid += 1
        return obj

    def gen_graph_line(el):
        nonlocal curid

        curved_line = False

        if 'origin' in el.attrib:
            origin = json.loads(st_attrib(el, 'origin'))
            x0 = origin['x']
            y0 = origin['y']
        else:
            x0 = y0 = 0

        if 'end-points' in el.attrib:
            line = json.loads(st_attrib(el, 'end-points'))
            n_end_points = len(line)
            if n_end_points == 2:
                x1 = line[0]['x']
                x2 = line[1]['x']
                y1 = line[0]['y']
                y2 = line[1]['y']
            elif n_end_points == 3:
                x1 = line[0]['x']
                x2 = line[1]['x']
                x3 = line[2]['x']
                y1 = line[0]['y']
                y2 = line[1]['y']
                y3 = line[2]['y']
                curved_line = True
            else:
                raise Exception('pl-graph-line error: the attribute end-points expects a list of size 2 or 3.')
        else:
            raise Exception('pl-graph-line error: required attribute end-points is missing.')

        if 'end-gradients' in el.attrib:
            if curved_line:
                raise Exception('You should either provide three points to make a curve or the gradient, but not both.')
            else:
                curved_line = True
                line = json.loads(st_attrib(el, 'end-gradients'))
                if len(line) != 2:
                    raise Exception('pl-graph-line error: the attribute end-gradients expects an array with 2 values, one for each end point.')
                dy1 = line[0]
                dy2 = line[1]
                if abs(dy1 - dy2) < 1e-9:
                    raise Exception('The provided gradients are not compatible to compute a quadratic curve between the given points.')
                else:
                    x3 = ((y2 - dy2 * x2) - (y1 - dy1 * x1)) / (dy1 - dy2)
                    y3 = (y1 - dy1 * x1) + dy1 * x3

        if 'draw-error-box' in el.attrib:
            obj_draw = el.attrib['draw-error-box'] == 'true'
        else:
            obj_draw = None

        offset_x = fl_attrib(el, 'offset-tol-x', 0)
        offset_y = fl_attrib(el, 'offset-tol-y', 0)
        offset_control_x = fl_attrib(el, 'offset-control-tol-x', 0)
        offset_control_y = fl_attrib(el, 'offset-control-tol-y', 0)
        grid_size = pl.get_integer_attrib(el, 'grid-size', 20)
        tol = pl.get_float_attrib(el, 'tol', grid_size / 2)

        # Defining the error boxes for end points
        wbox = 2 * tol + 2 * offset_x
        hbox = 2 * tol + 2 * offset_y
        # Defining the error box for the control point
        wbox_c = 2 * tol + 2 * offset_control_x
        hbox_c = 2 * tol + 2 * offset_control_y

        obj = {
            'id': curid,
            'x1': x0 + x1,
            'y1': y0 - y1,
            'stroke': pl.get_color_attrib(el, 'color', 'red'),
            'strokeWidth': fl_attrib(el, 'stroke-width', 4),
            'handleRadius': 6,
            'objectDrawErrorBox': obj_draw,
            'widthErrorBox': wbox,
            'heightErrorBox': hbox,
            'widthErrorBoxControl': wbox_c,
            'heightErrorBoxControl': hbox_c,
            'offset_x': offset_x,
            'offset_y': offset_y,
            'offset_control_x': offset_control_x,
            'offset_control_y': offset_control_y,
        }

        if not curved_line:
            obj.update({'x2': x0 + x2, 'y2': y0 - y2, 'type': 'controlledLine', 'gradingName': 'controlledLine'})
        else:
            obj.update({'x3': x0 + x2, 'y3': y0 - y2, 'x2': x0 + x3, 'y2': y0 - y3, 'type': 'controlledCurvedLine', 'gradingName': 'controlledCurvedLine'})

        curid += 1
        return obj

    gen = {
        'pl-controlled-line': gen_controlledLine,
        'pl-controlled-curved-line': gen_controlledCurvedLine,
        'pl-vector': gen_vector,
        'pl-double-headed-vector': gen_double_headed_vector,
        'pl-arc-vector': gen_arc_vector,
        'pl-distributed-load': gen_distributed_force,
        'pl-clamped': gen_clamped,
        'pl-fixed-pin': gen_fixed_pin,
        'pl-roller': gen_roller,
        'pl-rod': gen_rod,
        'pl-collar-rod': gen_collarrod,
        'pl-3pointrod': gen_3pointrod,
        'pl-4pointrod': gen_4pointrod,
        'pl-pulley': gen_pulley,
        'pl-spring': gen_spring,
        'pl-line': gen_line,
        'pl-arc': gen_arc,
        'pl-point': gen_point,
        'pl-rectangle': gen_rectangle,
        'pl-triangle': gen_triangle,
        'pl-circle': gen_circle,
        'pl-polygon': gen_polygon,
        'pl-dimensions': gen_dimensions,
        'pl-arc-dimensions': gen_arc_dimension,
        'pl-coordinates': gen_coordinates,
        'pl-text': gen_text,
        'pl-axes': gen_axes,
        'pl-graph-line': gen_graph_line,
    }

    objects = []
    for el in elem:
        if el.tag is lxml.etree.Comment:
            continue
        elif el.tag == 'pl-drawing-group':
            if bool_attrib(el, 'visible', True):
                curid += 1
                raw, _ = render_drawing_items(el, curid, {'groupid': curid})
                objs = raw['objects']
                curid += len(objs)
                objects.extend(objs)
        elif el.tag in gen:
            obj = defaults.copy()
            obj.update(gen[el.tag](el))
            objects.append(obj)
        else:
            warnings.warn('No known tag type: ' + el.tag)

    return ({'objects': objects}, curid)


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name', '')
    preview_mode = not pl.get_boolean_attrib(element, 'gradable', element_defaults['gradable'])
    with open('pl-drawing.mustache') as f:
        template = f.read()

    btn_markup = ''
    init = {'objects': []}

    for el in element:
        if el.tag is lxml.etree.Comment:
            continue
        elif el.tag == 'pl-controls' and not preview_mode:
            btn_markup = render_controls(template, el)
        elif el.tag == 'pl-drawing-initial':
            init, _ = render_drawing_items(el)
            draw_error_box = pl.get_boolean_attrib(el, 'draw-error-box', element_defaults['draw-error-box'])

    for obj in init['objects']:
        obj['graded'] = False
        obj['drawErrorBox'] = draw_error_box
        if 'objectDrawErrorBox' in obj:
            if obj['objectDrawErrorBox'] is not None:
                obj['drawErrorBox'] = obj['objectDrawErrorBox']

    grid_size = pl.get_integer_attrib(element, 'grid-size', element_defaults['grid-size'])
    tol = pl.get_float_attrib(element, 'tol', grid_size / 2)
    angle_tol = pl.get_float_attrib(element, 'angle-tol', element_defaults['angle-tol'])
    tol_percent = round(tol / grid_size, 2) if grid_size != 0 else 1

    js_options = {
        'snap_to_grid': pl.get_boolean_attrib(element, 'snap-to-grid', element_defaults['snap-to-grid']),
        'grid_size': grid_size,
        'editable': (data['panel'] == 'question' and not preview_mode),
        'base_url': data['options']['base_url'],
        'client_files': '/pl/static/elements/pl-drawing/clientFilesElement/',
        'render_scale': pl.get_float_attrib(element, 'render-scale', element_defaults['render-scale'])
    }

    show_btn = data['panel'] == 'question' and not preview_mode

    if tol == grid_size / 2:
        message_default = 'The expected tolerance is 1/2 square grid for position and ' + str(angle_tol) + ' degrees for angle.'
    else:
        message_default = 'The expected tolerance is ' + str(tol_percent) + ' square grid for position and ' + str(angle_tol) + ' degrees for angle.'

    html_params = {
        'uuid': pl.get_uuid(),
        'width': pl.get_string_attrib(element, 'width', element_defaults['width']),
        'height': pl.get_string_attrib(element, 'height', element_defaults['height']),
        'options_json': json.dumps(js_options),
        'show_buttons': show_btn,
        'name': name,
        'render_element': True,
        'btn_markup': btn_markup,
        'show_tolerance': show_btn and pl.get_boolean_attrib(element, 'show-tolerance-hint', element_defaults['show-tolerance-hint']),
        'tolerance': pl.get_string_attrib(element, 'tolerance-hint', message_default),
    }

    if (not (data['panel'] == 'question') and preview_mode) or data['panel'] == 'answer' and pl.get_boolean_attrib(element, 'hide-answer-panel', True):
        return ''

    if preview_mode:
        html_params['input_answer'] = json.dumps(init)
    else:
        if data['panel'] == 'answer' and name in data['correct_answers']:
            html_params['input_answer'] = json.dumps(data['correct_answers'][name])
        else:
            sub = {'objects': []}
            if name in data['submitted_answers']:
                sub = data['submitted_answers'][name]
            items = union_drawing_items(init, sub)
            html_params['input_answer'] = json.dumps(items)

    # Grading feedback
    if data['panel'] == 'submission':
        if name in data['partial_scores']:
            gr_feedback = data['partial_scores'][name]['feedback']
            if not gr_feedback['correct']:
                html_feedback = ''
                for elem, num in gr_feedback['missing'].items():
                    html_feedback += '<li>'
                    if num > 1:
                        html_feedback += '$' + str(num) + '\\times$'

                    if elem in element_names:
                        html_feedback += element_names[elem]
                    else:
                        html_feedback += elem
                # html_params['feedback'] = html_feedback
                # ^ Uncomment to enable feedback ^
        else:
            parse_error = data['format_errors'].get(name, None)
            html_params['parse_error'] = parse_error

    return chevron.render(template, html_params).strip()


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name', element_defaults['answers-name'])
    preview_mode = not pl.get_boolean_attrib(element, 'gradable', element_defaults['gradable'])

    if preview_mode:
        return data

    try:
        data['submitted_answers'][name] = json.loads(data['submitted_answers'][name])
        if 'objects' not in data['submitted_answers'][name]:
            data['format_errors'][name] = 'No submitted answer.'
            data['submitted_answers'][name] = {}
    except json.JSONDecodeError:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = {}

    return data


def grade(element_html, data):

    element = lxml.html.fragment_fromstring(element_html)
    prev = not pl.get_boolean_attrib(element, 'gradable', element_defaults['gradable'])
    if prev:
        return

    grid_size = pl.get_integer_attrib(element, 'grid-size', element_defaults['grid-size'])
    tol = pl.get_float_attrib(element, 'tol', grid_size / 2)
    angtol = pl.get_float_attrib(element, 'angle-tol', element_defaults['angle-tol'])

    name = pl.get_string_attrib(element, 'answers-name', element_defaults['answers-name'])
    student = data['submitted_answers'][name]
    reference = data['correct_answers'][name]

    if not isinstance(student, dict):
        data['format_errors'][name] = 'No submitted answer.'
        return data

    if 'objects' not in student:
        data['format_errors'][name] = 'No submitted answer.'
        return data

    def abserr(x, xapp):
        return np.abs(x - xapp)

    def abserr_ang(ref, x):
        return np.abs(((np.abs(ref - x) + 180) % 360) - 180)

    def comp_controlledLine(ref, st):
        ex1, ex2 = st['x1'], st['x2']
        ey1, ey2 = st['y1'], st['y2']
        rx1, rx2 = ref['x1'], ref['x2']
        ry1, ry2 = ref['y1'], ref['y2']
        # Check endpoints (any order)
        return_bool = (
            abserr(ex1, rx1) <= ref['offset_x'] + tol and abserr(ey1, ry1) <= ref['offset_y'] + tol and abserr(ex2, rx2) <= ref['offset_x'] + tol and abserr(ey2, ry2) <= ref['offset_y'] + tol
        ) or (abserr(ex1, rx2) <= ref['offset_x'] + tol and abserr(ey1, ry2) <= ref['offset_y'] + tol and abserr(ex2, rx1) <= ref['offset_x'] + tol and abserr(ey2, ry1) <= ref['offset_y'] + tol)
        return return_bool

    def comp_controlledCurvedLine(ref, st):
        ex1, ex2, exm = st['x1'], st['x3'], st['x2']
        ey1, ey2, eym = st['y1'], st['y3'], st['y2']
        rx1, rx2, rxm = ref['x1'], ref['x3'], ref['x2']
        ry1, ry2, rym = ref['y1'], ref['y3'], ref['y2']
        # Check endpoints (any order) and the mid control point
        b1 = (abserr(ex1, rx1) <= ref['offset_x'] + tol and abserr(ey1, ry1) <= ref['offset_y'] + tol and abserr(ex2, rx2) <= ref['offset_x'] + tol and abserr(ey2, ry2) <= ref['offset_y'] + tol and abserr(exm, rxm) <= ref['offset_control_x'] + tol and abserr(eym, rym) <= ref['offset_control_y'] + tol)
        b2 = (abserr(ex1, rx2) <= ref['offset_x'] + tol and abserr(ey1, ry2) <= ref['offset_y'] + tol and abserr(ex2, rx1) <= ref['offset_x'] + tol and abserr(ey2, ry1) <= ref['offset_y'] + tol and abserr(exm, rxm) <= ref['offset_control_x'] + tol and abserr(eym, rym) <= ref['offset_control_y'] + tol)
        return b1 or b2

    def comp_vector(ref, st):
        epos = np.array([st['left'], st['top']]).astype(np.float64)
        eang = st['angle']
        elen = st['width']

        # Adjust position if the vector is centered
        # I think this will always be true, since this attribute cannot be modified by instructor or student
        # maybe consider removing this check?
        if st.get('originX', '') == 'center':
            eang_rad = eang * (np.pi / 180.0)
            st_dir = np.array([np.cos(eang_rad), np.sin(eang_rad)])
            epos -= st_dir * np.float64(elen) / 2

        # Get the position of the anchor point for the correct answer
        rpos = np.array([ref['x1'], ref['y1']])

        # Get the angle for the correct answer
        rang = ref['angle']
        rang_bwd = ref['angle'] + 180
        rang_rad = rang * (np.pi / 180.0)

        # Defining the error box limit in the direction of the vector
        max_backward = ref['offset_backward'] + tol
        max_forward = ref['offset_forward'] + tol

        # Check the angles
        error_fwd = abserr_ang(rang, eang)
        error_bwd = abserr_ang(rang_bwd, eang)

        if ref['disregard_sense']:
            if error_fwd > angtol and error_bwd > angtol:
                return False
        else:
            if error_fwd > angtol:
                return False

        # Get position of student answer relative to reference answer
        basis = np.array([[np.cos(rang_rad), -np.sin(rang_rad)], [np.sin(rang_rad), np.cos(rang_rad)]]).T
        epos_rel = basis @ (epos - rpos)
        rely, relx = epos_rel

        if relx > tol or relx < -tol or rely > max_forward or rely < -max_backward:
            return False

        return True

    def comp_distLoad(ref, st):
        epos = np.array([st['left'], st['top']]).astype(np.float64)
        eang = st['angle']
        elen = st['range']
        ew1 = st['w1']
        ew2 = st['w2']

        # Get the position of the anchor point for the correct answer
        rpos = np.array([ref['x1'], ref['y1']])
        # Get the angle for the correct answer
        rang = ref['angle']
        rang_bwd = ref['angle'] + 180
        rang_rad = rang * (np.pi / 180.0)
        rlen = ref['range']
        rw1 = ref['w1']
        rw2 = ref['w2']
        # Defining the error box limit in the direction of the vector
        max_backward = ref['offset_backward'] + tol
        max_forward = ref['offset_forward'] + tol

        # Check the angles
        error_fwd = abserr_ang(rang, eang)
        error_bwd = abserr_ang(rang_bwd, eang)

        if ref['disregard_sense']:
            if error_fwd > angtol and error_bwd > angtol:
                return False
        else:
            if error_fwd > angtol:
                return False

        # Check width
        if abserr(elen, rlen) > tol:
            return False

        # Get position of student answer relative to reference answer
        basis = np.array([[-np.sin(rang_rad), -np.cos(rang_rad)], [np.cos(rang_rad), -np.sin(rang_rad)]]).T
        epos_rel = basis @ (epos - rpos)
        rely, relx = epos_rel
        if relx > tol or relx < -tol or rely > max_forward or rely < -max_backward:
            return False

        # Check the distribution
        if rw1 == rw2:  # This is an uniform load
            if ew1 != ew2:
                return False
        else:
            if st.get('flipped', False):
                ew1, ew2 = ew2, ew1
            if (rw1 < rw2 and ew1 > ew2) or (rw1 > rw2 and ew1 < ew2):
                return False

        return True

    def comp_arc_vector(ref, st):

        epos = np.array([st['left'], st['top']]).astype(np.float64)
        st_start_arrow = st['drawStartArrow']

        rpos = np.array([ref['left'], ref['top']])
        ref_start_arrow = ref['drawStartArrow']

        # Check if correct position
        relx, rely = epos - rpos
        if relx > tol or relx < -tol or rely > tol or rely < -tol:
            return False

        # Check if correct orientation
        if not ref['disregard_sense']:
            if st_start_arrow is not ref_start_arrow:
                return False

        return True

    def comp_point(ref, st):

        epos = np.array([st['left'], st['top']]).astype(np.float64)
        rpos = np.array([ref['left'], ref['top']])
        # Check if correct position
        relx, rely = epos - rpos
        if relx > tol or relx < -tol or rely > tol or rely < -tol:
            return False

        return True

    comp = {
        'controlledLine': comp_controlledLine,
        'controlledCurvedLine': comp_controlledCurvedLine,
        'vector': comp_vector,
        'double_headed_vector': comp_vector,
        'arc_vector': comp_arc_vector,
        'distTrianLoad': comp_distLoad,
        'point': comp_point,
    }

    matches = {}  # If a reference object is matched to a student object
    num_correct = 0  # number correct
    num_total_ref = 0
    num_total_st = 0
    num_optional = 0

    # Ensure that each reference object matches one and only one
    # student object.  Ungraded elements are skipped.
    # num_total_ref is the total number of objects that are expected to be graded
    # this disregards optional objects and objects that don't have a grading function
    for ref_element in reference['objects']:
        if ref_element['gradingName'] in comp and ref_element['graded']:
            matches[ref_element['id']] = False
            if 'optional_grading' in ref_element and ref_element['optional_grading']:
                continue
            num_total_ref += 1

    # Loop through and check everything
    for element in student['objects']:
        if 'gradingName' not in element or element['gradingName'] not in comp or not element['graded']:
            continue
        # total number of objects inserted by students (using buttons)
        # this will disregard the initial objects placed by question authors
        num_total_st += 1

        for ref_element in reference['objects']:
            if ref_element['gradingName'] not in comp or ref_element['id'] not in matches or matches[ref_element['id']] or not ref_element['graded'] or element['gradingName'] != ref_element['gradingName']:
                continue

            if comp[element['gradingName']](ref_element, element):
                matches[ref_element['id']] = True

                if 'optional_grading' in ref_element and ref_element['optional_grading']:
                    # It's optional but correct, so the score should not be affected
                    num_optional += 1
                else:
                    # if correct but optional, it does not add on number of correct answers,
                    # but the object will not be considered as extra
                    num_correct += 1
                break

    extra_not_optional = num_total_st - (num_optional + num_correct)

    if num_total_ref == 0:
        score = 1
    else:
        percent_correct = num_correct / num_total_ref
        if percent_correct == 1:
            # if all the expected objects are matched
            # penalize extra objects
            score = max(0, percent_correct - extra_not_optional / num_total_ref)
        else:
            score = percent_correct

    data['partial_scores'][name] = {'score': score, 'weight': 1, 'feedback': {'correct': (score == 1), 'missing': {}, 'matches': matches}}

    return data
