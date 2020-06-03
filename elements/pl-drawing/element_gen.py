import prairielearn as pl
import math
import numpy as np
import numpy.linalg as la
import json

# Generate element representations

drawing_defaults = {
    'x1': 40,
    'y1': 40,
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


def gen_controlledLine(el):
    if 'draw-error-box' in el.attrib:
        obj_draw = el.attrib['draw-error-box'] == 'true'
    else:
        obj_draw = None

    offset_x = pl.get_float_attrib(el, 'offset-tol-x', 0)
    offset_y = pl.get_float_attrib(el, 'offset-tol-y', 0)
    grid_size = pl.get_integer_attrib(el, 'grid-size', 20)
    tol = pl.get_float_attrib(el, 'tol', grid_size / 2)

    # Defining the error boxes for end points
    wbox = 2 * tol + 2 * offset_x
    hbox = 2 * tol + 2 * offset_y

    obj = {
        'x1': pl.get_float_attrib(el, 'x1', 20),
        'x2': pl.get_float_attrib(el, 'x2', 40),
        'y1': pl.get_float_attrib(el, 'y1', 40),
        'y2': pl.get_float_attrib(el, 'y2', 40),
        'type': 'controlledLine',
        'stroke': pl.get_color_attrib(el, 'color', 'red'),
        'gradingName': 'controlledLine',
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', 4),
        'handleRadius': pl.get_float_attrib(el, 'handle-radius', 6),
        'objectDrawErrorBox': obj_draw,
        'widthErrorBox': wbox,
        'heightErrorBox': hbox,
        'offset_x': offset_x,
        'offset_y': offset_y,
    }
    return obj


def gen_controlledCurvedLine(el):
    if 'draw-error-box' in el.attrib:
        obj_draw = el.attrib['draw-error-box'] == 'true'
    else:
        obj_draw = None

    offset_x = pl.get_float_attrib(el, 'offset-tol-x', 0)
    offset_y = pl.get_float_attrib(el, 'offset-tol-y', 0)
    offset_control_x = pl.get_float_attrib(el, 'offset-control-tol-x', 0)
    offset_control_y = pl.get_float_attrib(el, 'offset-control-tol-y', 0)
    grid_size = pl.get_integer_attrib(el, 'grid-size', 20)
    tol = pl.get_float_attrib(el, 'tol', grid_size / 2)

    # Defining the error boxes for end points
    wbox = 2 * tol + 2 * offset_x
    hbox = 2 * tol + 2 * offset_y
    # Defining the error box for the control point
    wbox_c = 2 * tol + 2 * offset_control_x
    hbox_c = 2 * tol + 2 * offset_control_y

    obj = {
        'x1': pl.get_float_attrib(el, 'x1', 20),
        'y1': pl.get_float_attrib(el, 'y1', 40),
        'x3': pl.get_float_attrib(el, 'x2', 60),
        'y3': pl.get_float_attrib(el, 'y2', 40),
        'x2': pl.get_float_attrib(el, 'x3', 40),
        'y2': pl.get_float_attrib(el, 'y3', 60),
        'type': 'controlledCurvedLine',
        'stroke': pl.get_color_attrib(el, 'color', 'red'),
        'gradingName': 'controlledCurvedLine',
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', 4),
        'handleRadius': pl.get_float_attrib(el, 'handle-radius', 6),
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
    return obj


def gen_roller(el):
    color = pl.get_color_attrib(el, 'color', 'brown1')
    stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
    obj = {
        'x1': pl.get_float_attrib(el, 'x1', drawing_defaults['x1']),
        'y1': pl.get_float_attrib(el, 'y1', drawing_defaults['y1']),
        'height': pl.get_float_attrib(el, 'height', drawing_defaults['height']),
        'width': pl.get_float_attrib(el, 'width', drawing_defaults['width']),
        'angle': pl.get_float_attrib(el, 'angle', drawing_defaults['angle']),
        'label': pl.get_string_attrib(el, 'label', drawing_defaults['label']),
        'offsetx': pl.get_float_attrib(el, 'offsetx', drawing_defaults['offsetx']),
        'offsety': pl.get_float_attrib(el, 'offsety', drawing_defaults['offsety']),
        'color': color,
        'stroke': stroke_color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
        'drawPin': json.loads(pl.get_string_attrib(el, 'draw-pin', 'true')),
        'drawGround': json.loads(pl.get_string_attrib(el, 'draw-ground', 'true')),
        'selectable': drawing_defaults['selectable'],
        'evented': drawing_defaults['selectable'],
        'type': 'roller',
        'gradingName': 'roller',
    }
    return obj


def gen_clamped(el):
    color = pl.get_color_attrib(el, 'color', 'black')
    obj = {
        'x1': pl.get_float_attrib(el, 'x1', drawing_defaults['x1']),
        'y1': pl.get_float_attrib(el, 'y1', drawing_defaults['y1']),
        'height': pl.get_float_attrib(el, 'height', drawing_defaults['height']),
        'width': pl.get_float_attrib(el, 'width', drawing_defaults['width']),
        'angle': pl.get_float_attrib(el, 'angle', drawing_defaults['angle']),
        'label': pl.get_string_attrib(el, 'label', drawing_defaults['label']),
        'offsetx': pl.get_float_attrib(el, 'offsetx', drawing_defaults['offsetx']),
        'offsety': pl.get_float_attrib(el, 'offsety', drawing_defaults['offsety']),
        'color': color,
        'stroke': pl.get_string_attrib(el, 'stroke-color', 'black'),
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
        'selectable': drawing_defaults['selectable'],
        'evented': drawing_defaults['selectable'],
        'type': 'clamped',
        'gradingName': 'clamped',
    }
    return obj


def gen_fixed_pin(el):
    color = pl.get_color_attrib(el, 'color', 'brown1')
    stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
    obj = {
        'x1': pl.get_float_attrib(el, 'x1', drawing_defaults['x1']),
        'y1': pl.get_float_attrib(el, 'y1', drawing_defaults['y1']),
        'height': pl.get_float_attrib(el, 'height', drawing_defaults['height']),
        'width': pl.get_float_attrib(el, 'width', drawing_defaults['width']),
        'angle': pl.get_float_attrib(el, 'angle', drawing_defaults['angle']),
        'label': pl.get_string_attrib(el, 'label', drawing_defaults['label']),
        'offsetx': pl.get_float_attrib(el, 'offsetx', drawing_defaults['offsetx']),
        'offsety': pl.get_float_attrib(el, 'offsety', drawing_defaults['offsety']),
        'color': color,
        'stroke': stroke_color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
        'drawPin': json.loads(pl.get_string_attrib(el, 'draw-pin', 'true')),
        'drawGround': json.loads(pl.get_string_attrib(el, 'draw-ground', 'true')),
        'selectable': drawing_defaults['selectable'],
        'evented': drawing_defaults['selectable'],
        'type': 'fixed-pin',
        'gradingName': 'fixed-pin',
    }
    return obj


def gen_rod(el):
    color = pl.get_color_attrib(el, 'color', 'white')
    stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
    obj = {
        'height': pl.get_float_attrib(el, 'width', drawing_defaults['width-rod']),
        'x1': pl.get_float_attrib(el, 'x1', drawing_defaults['x1']),
        'y1': pl.get_float_attrib(el, 'y1', drawing_defaults['y1']),
        'label1': pl.get_string_attrib(el, 'label1', drawing_defaults['label']),
        'offsetx1': pl.get_float_attrib(el, 'offsetx1', drawing_defaults['offsetx']),
        'offsety1': pl.get_float_attrib(el, 'offsety1', drawing_defaults['offsety']),
        'x2': pl.get_float_attrib(el, 'x2', drawing_defaults['x2']),
        'y2': pl.get_float_attrib(el, 'y2', drawing_defaults['y2']),
        'label2': pl.get_string_attrib(el, 'label2', drawing_defaults['label']),
        'offsetx2': pl.get_float_attrib(el, 'offsetx2', drawing_defaults['offsetx']),
        'offsety2': pl.get_float_attrib(el, 'offsety2', drawing_defaults['offsety']),
        'color': color,
        'stroke': stroke_color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
        'drawPin': json.loads(pl.get_string_attrib(el, 'draw-pin', 'true')),
        'selectable': drawing_defaults['selectable'],
        'evented': drawing_defaults['selectable'],
        'type': 'rod',
        'gradingName': 'rod',
    }
    return obj


def gen_collarrod(el):
    w = pl.get_float_attrib(el, 'width', 20)
    color = pl.get_color_attrib(el, 'color', 'white')
    stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
    obj = {
        'height': w,
        'x1': pl.get_float_attrib(el, 'x1', 40),
        'y1': pl.get_float_attrib(el, 'y1', 40),
        'collar1': pl.get_boolean_attrib(el, 'draw-collar-end1', True),
        'w1': pl.get_float_attrib(el, 'w1', 1.5 * w),
        'h1': pl.get_float_attrib(el, 'h1', 2 * w),
        'label1': pl.get_string_attrib(el, 'label1', ''),
        'offsetx1': pl.get_float_attrib(el, 'offsetx1', 2),
        'offsety1': pl.get_float_attrib(el, 'offsety1', 2),
        'x2': pl.get_float_attrib(el, 'x2', 100),
        'y2': pl.get_float_attrib(el, 'y2', 40),
        'w2': pl.get_float_attrib(el, 'w2', 1.5 * w),
        'h2': pl.get_float_attrib(el, 'h2', 2 * w),
        'collar2': pl.get_boolean_attrib(el, 'draw-collar-end2', False),
        'label2': pl.get_string_attrib(el, 'label2', ''),
        'offsetx2': pl.get_float_attrib(el, 'offsetx2', 2),
        'offsety2': pl.get_float_attrib(el, 'offsety2', 2),
        'color': color,
        'stroke': stroke_color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
        'drawPin': json.loads(pl.get_string_attrib(el, 'draw-pin', 'true')),
        'selectable': drawing_defaults['selectable'],
        'evented': drawing_defaults['selectable'],
        'type': 'collarrod',
        'gradingName': 'collarrod',
    }
    return obj


def gen_3pointrod(el):
    color = pl.get_color_attrib(el, 'color', 'white')
    stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
    x1 = pl.get_float_attrib(el, 'x1', 40)
    y1 = pl.get_float_attrib(el, 'y1', 100)
    x2 = pl.get_float_attrib(el, 'x2', 100)
    y2 = pl.get_float_attrib(el, 'y2', 100)
    x3 = pl.get_float_attrib(el, 'x3', 100)
    y3 = pl.get_float_attrib(el, 'y3', 140)
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
        'height': pl.get_float_attrib(el, 'width', 20),
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
        'label1': pl.get_string_attrib(el, 'label1', ''),
        'offsetx1': pl.get_float_attrib(el, 'offsetx1', 0),
        'offsety1': pl.get_float_attrib(el, 'offsety1', -20),
        'label2': pl.get_string_attrib(el, 'label2', ''),
        'offsetx2': pl.get_float_attrib(el, 'offsetx2', 0),
        'offsety2': pl.get_float_attrib(el, 'offsety2', -20),
        'label3': pl.get_string_attrib(el, 'label3', ''),
        'offsetx3': pl.get_float_attrib(el, 'offsetx3', 0),
        'offsety3': pl.get_float_attrib(el, 'offsety3', -20),
        'color': color,
        'stroke': stroke_color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
        'drawPin': json.loads(pl.get_string_attrib(el, 'draw-pin', 'true')),
        'selectable': drawing_defaults['selectable'],
        'evented': drawing_defaults['selectable'],
        'type': 'Lshaperod',
        'gradingName': 'Lshaperod',
    }
    return obj


def gen_4pointrod(el):
    color = pl.get_color_attrib(el, 'color', 'white')
    stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
    x1 = pl.get_float_attrib(el, 'x1', 40)
    y1 = pl.get_float_attrib(el, 'y1', 100)
    x2 = pl.get_float_attrib(el, 'x2', 100)
    y2 = pl.get_float_attrib(el, 'y2', 100)
    x3 = pl.get_float_attrib(el, 'x3', 100)
    y3 = pl.get_float_attrib(el, 'y3', 160)
    x4 = pl.get_float_attrib(el, 'x4', 140)
    y4 = pl.get_float_attrib(el, 'y4', 60)
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
        'height': pl.get_float_attrib(el, 'width', 20),
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
        'label1': pl.get_string_attrib(el, 'label1', ''),
        'offsetx1': pl.get_float_attrib(el, 'offsetx1', 0),
        'offsety1': pl.get_float_attrib(el, 'offsety1', -20),
        'label2': pl.get_string_attrib(el, 'label2', ''),
        'offsetx2': pl.get_float_attrib(el, 'offsetx2', 0),
        'offsety2': pl.get_float_attrib(el, 'offsety2', -20),
        'label3': pl.get_string_attrib(el, 'label3', ''),
        'offsetx3': pl.get_float_attrib(el, 'offsetx3', 0),
        'offsety3': pl.get_float_attrib(el, 'offsety3', -20),
        'label4': pl.get_string_attrib(el, 'label4', ''),
        'offsetx4': pl.get_float_attrib(el, 'offsetx4', 0),
        'offsety4': pl.get_float_attrib(el, 'offsety4', -20),
        'color': color,
        'stroke': stroke_color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
        'drawPin': json.loads(pl.get_string_attrib(el, 'draw-pin', 'true')),
        'selectable': drawing_defaults['selectable'],
        'evented': drawing_defaults['selectable'],
        'type': 'Tshaperod',
        'gradingName': 'Tshaperod',
    }
    return obj


def gen_pulley(el):
    color = pl.get_color_attrib(el, 'color', 'gray')
    stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
    r = pl.get_float_attrib(el, 'radius', 20)
    x1 = pl.get_float_attrib(el, 'x1', 100)
    y1 = pl.get_float_attrib(el, 'y1', 100)
    x2 = pl.get_float_attrib(el, 'x2', 140)
    y2 = pl.get_float_attrib(el, 'y2', 140)
    x3 = pl.get_float_attrib(el, 'x3', 40)
    y3 = pl.get_float_attrib(el, 'y3', 130)
    uO = np.array([x1, y1])
    uA = np.array([x2, y2])
    uB = np.array([x3, y3])
    longer = pl.get_boolean_attrib(el, 'alternative-path', 'false')

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
        'label': pl.get_string_attrib(el, 'label', ''),
        'offsetx': pl.get_float_attrib(el, 'offsetx', 2),
        'offsety': pl.get_float_attrib(el, 'offsety', 2),
        'stroke': stroke_color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
        'fill': color,
        'type': 'pulley',
        'gradingName': 'pulley',
    }
    return obj


def gen_vector(el):
    color = pl.get_color_attrib(el, 'color', 'red3')
    anchor_is_tail = pl.get_boolean_attrib(el, 'anchor-is-tail', True)
    # This is the anchor point for Grading
    x1 = pl.get_float_attrib(el, 'x1', 30)
    y1 = pl.get_float_attrib(el, 'y1', 10)
    # This is the end point used for plotting
    left = x1
    top = y1
    w = pl.get_float_attrib(el, 'width', drawing_defaults['force-width'])
    angle = pl.get_float_attrib(el, 'angle', 0)
    theta = angle * math.pi / 180
    if not anchor_is_tail:
        left -= w * math.cos(theta)
        top -= w * math.sin(theta)
    # Error box for grading
    disregard_sense = pl.get_boolean_attrib(el, 'disregard-sense', False)
    if disregard_sense:
        offset_forward_default = w
    else:
        offset_forward_default = 0
    offset_forward = pl.get_float_attrib(el, 'offset-forward', offset_forward_default)
    offset_backward = pl.get_float_attrib(el, 'offset-backward', w)

    grid_size = pl.get_integer_attrib(el, 'grid-size', 20)
    tol = pl.get_float_attrib(el, 'tol', grid_size / 2)
    pc, hbox, wbox, _, _ = get_error_box(x1, y1, theta, tol, offset_forward, offset_backward)

    if 'draw-error-box' in el.attrib:
        obj_draw = el.attrib['draw-error-box'] == 'true'
    else:
        obj_draw = None

    obj = {
        'left': left,
        'top': top,
        'x1': x1,
        'y1': y1,
        'width': w,
        'angle': angle,
        'label': pl.get_string_attrib(el, 'label', ''),
        'offsetx': pl.get_float_attrib(el, 'offsetx', 2),
        'offsety': pl.get_float_attrib(el, 'offsety', 2),
        'stroke': color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', 3),
        'arrowheadWidthRatio': pl.get_float_attrib(el, 'arrow-head-width', 1),
        'arrowheadOffsetRatio': pl.get_float_attrib(el, 'arrow-head-length', 1),
        'drawStartArrow': False,
        'drawEndArrow': True,
        'originY': 'center',
        'trueHandles': ['mtr'],
        'disregard_sense': disregard_sense,
        'optional_grading': pl.get_boolean_attrib(el, 'optional-grading', False),
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
    return obj


def gen_double_headed_vector(el):
    obj = gen_vector(el)
    obj['type'] = 'doubleArrow'
    obj['gradingName'] = 'double_headed_vector'
    return obj


def gen_arc_vector(el):
    disregard_sense = pl.get_boolean_attrib(el, 'disregard-sense', False)
    color = pl.get_color_attrib(el, 'color', 'purple')
    clockwise_direction = pl.get_boolean_attrib(el, 'clockwise-direction', True)
    if clockwise_direction:
        drawStartArrow = False
        drawEndArrow = True
    else:
        drawStartArrow = True
        drawEndArrow = False
    # Error box for grading
    x1 = pl.get_float_attrib(el, 'x1', 40)
    y1 = pl.get_float_attrib(el, 'y1', 40)

    if 'draw-error-box' in el.attrib:
        obj_draw = el.attrib['draw-error-box'] == 'true'
    else:
        obj_draw = None

    offset_forward = pl.get_float_attrib(el, 'offset-forward', 0)
    offset_backward = pl.get_float_attrib(el, 'offset-backward', 0)

    grid_size = pl.get_integer_attrib(el, 'grid-size', 20)
    tol = pl.get_float_attrib(el, 'tol', grid_size / 2)
    pc, hbox, wbox, _, _ = get_error_box(x1, y1, 0, tol, offset_forward, offset_backward)

    obj = {
        'left': x1,
        'top': y1,
        'angle': 0,
        'radius': pl.get_float_attrib(el, 'radius', 30),
        'startAngle': pl.get_float_attrib(el, 'start-angle', 0),
        'endAngle': pl.get_float_attrib(el, 'end-angle', 210),
        'drawCenterPoint': json.loads(pl.get_string_attrib(el, 'draw-center', 'true')),
        'drawStartArrow': drawStartArrow,
        'drawEndArrow': drawEndArrow,
        'label': pl.get_string_attrib(el, 'label', ''),
        'offsetx': pl.get_float_attrib(el, 'offsetx', 0),
        'offsety': pl.get_float_attrib(el, 'offsety', 0),
        'stroke': color,
        'fill': color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', 3),
        'arrowheadWidthRatio': pl.get_float_attrib(el, 'arrow-head-width', 1),
        'arrowheadOffsetRatio': pl.get_float_attrib(el, 'arrow-head-length', 1),
        'disregard_sense': disregard_sense,
        'optional_grading': pl.get_boolean_attrib(el, 'optional-grading', False),
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
    return obj


def gen_distributed_force(el):
    color = pl.get_color_attrib(el, 'color', 'red3')
    anchor_is_tail = pl.get_boolean_attrib(el, 'anchor-is-tail', True)
    # This is the anchor point for Grading
    x1 = pl.get_float_attrib(el, 'x1', 30)
    y1 = pl.get_float_attrib(el, 'y1', 10)
    # This is the end point used for plotting
    left = x1
    top = y1
    w = pl.get_float_attrib(el, 'width', drawing_defaults['force-width'])
    w1 = pl.get_float_attrib(el, 'w1', drawing_defaults['force-width'])
    w2 = pl.get_float_attrib(el, 'w2', drawing_defaults['force-width'])
    wmax = max(w1, w2)
    angle = pl.get_float_attrib(el, 'angle', 0)
    theta = angle * math.pi / 180
    if not anchor_is_tail:
        left += wmax * math.sin(theta)
        top -= wmax * math.cos(theta)
    # Error box for grading
    disregard_sense = pl.get_boolean_attrib(el, 'disregard-sense', False)
    if disregard_sense:
        offset_forward_default = 1.1 * wmax
    else:
        offset_forward_default = 0
    offset_forward = pl.get_float_attrib(el, 'offset-forward', offset_forward_default)
    offset_backward = pl.get_float_attrib(el, 'offset-backward', 1.1 * wmax)

    grid_size = pl.get_integer_attrib(el, 'grid-size', 20)
    tol = pl.get_float_attrib(el, 'tol', grid_size / 2)
    pc, wbox, hbox, _, _ = get_error_box(x1, y1, theta + math.pi / 2, tol, offset_forward, offset_backward)

    if 'draw-error-box' in el.attrib:
        obj_draw = el.attrib['draw-error-box'] == 'true'
    else:
        obj_draw = None

    obj = {
        'left': left,
        'top': top,
        'x1': x1,
        'y1': y1,
        'angle': angle,
        'range': w,
        'spacing': pl.get_float_attrib(el, 'spacing', 20),
        'w1': w1,
        'w2': w2,
        'label1': pl.get_string_attrib(el, 'label1', ''),
        'offsetx1': pl.get_float_attrib(el, 'offsetx1', 2),
        'offsety1': pl.get_float_attrib(el, 'offsety1', 2),
        'label2': pl.get_string_attrib(el, 'label2', ''),
        'offsetx2': pl.get_float_attrib(el, 'offsetx2', 2),
        'offsety2': pl.get_float_attrib(el, 'offsety2', 2),
        'label': pl.get_string_attrib(el, 'label', ''),
        'offsetx': pl.get_float_attrib(el, 'offsetx', 2),
        'offsety': pl.get_float_attrib(el, 'offsety', 2),
        'stroke': color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', 3),
        'arrowheadWidthRatio': pl.get_float_attrib(el, 'arrow-head-width', 2),
        'arrowheadOffsetRatio': pl.get_float_attrib(el, 'arrow-head-length', 3),
        'drawStartArrow': False,
        'drawEndArrow': True,
        'anchor_is_tail': pl.get_string_attrib(el, 'anchor-is-tail', 'true'),
        'trueHandles': ['mtr'],
        'disregard_sense': disregard_sense,
        'optional_grading': pl.get_boolean_attrib(el, 'optional-grading', False),
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
    return obj


def gen_point(el):
    color = pl.get_color_attrib(el, 'color', 'black')
    # Error box for grading
    x1 = pl.get_float_attrib(el, 'x1', 40)
    y1 = pl.get_float_attrib(el, 'y1', 40)

    if 'draw-error-box' in el.attrib:
        obj_draw = el.attrib['draw-error-box'] == 'true'
    else:
        obj_draw = None

    offset_forward = pl.get_float_attrib(el, 'offset-forward', 0)
    offset_backward = pl.get_float_attrib(el, 'offset-backward', 0)

    grid_size = pl.get_integer_attrib(el, 'grid-size', 20)
    tol = pl.get_float_attrib(el, 'tol', grid_size / 2)
    pc, hbox, wbox, _, _ = get_error_box(x1, y1, 0, tol, offset_forward, offset_backward)

    obj = {
        'left': pl.get_float_attrib(el, 'x1', 20),
        'top': pl.get_float_attrib(el, 'y1', 20),
        'radius': pl.get_float_attrib(el, 'radius', drawing_defaults['point-size']),
        'objectDrawErrorBox': obj_draw,
        'XcenterErrorBox': pc[0] if pc is not None else pc,
        'YcenterErrorBox': pc[1] if pc is not None else pc,
        'widthErrorBox': wbox,
        'heightErrorBox': hbox,
        'offset_forward': offset_forward,
        'offset_backward': offset_backward,
        'label': pl.get_string_attrib(el, 'label', drawing_defaults['label']),
        'offsetx': pl.get_float_attrib(el, 'offsetx', 5),
        'offsety': pl.get_float_attrib(el, 'offsety', 5),
        'originX': 'center',
        'originY': 'center',
        'fill': color,
        'selectable': drawing_defaults['selectable'],
        'evented': drawing_defaults['selectable'],
        'type': 'circle',
        'gradingName': 'point',
    }
    return obj


def gen_coordinates(el):
    color = pl.get_color_attrib(el, 'color', 'black')
    obj = {
        'left': pl.get_float_attrib(el, 'x1', drawing_defaults['x1']),
        'top': pl.get_float_attrib(el, 'y1', drawing_defaults['y1']),
        'width': pl.get_float_attrib(el, 'width', drawing_defaults['width']),
        'label': pl.get_string_attrib(el, 'label', ''),
        'offsetx': pl.get_float_attrib(el, 'offsetx', -16),
        'offsety': pl.get_float_attrib(el, 'offsety', -10),
        'labelx': pl.get_string_attrib(el, 'label-x', 'x'),
        'labely': pl.get_string_attrib(el, 'label-y', 'y'),
        'offsetx_label_x': pl.get_float_attrib(el, 'offsetx-label-x', 0),
        'offsety_label_x': pl.get_float_attrib(el, 'offsety-label-x', 0),
        'offsetx_label_y': pl.get_float_attrib(el, 'offsetx-label-y', -20),
        'offsety_label_y': pl.get_float_attrib(el, 'offsety-label-y', -10),
        'stroke': color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
        'angle': pl.get_float_attrib(el, 'angle', 0),
        'arrowheadWidthRatio': pl.get_float_attrib(el, 'arrow-head-width', 1),
        'arrowheadOffsetRatio': pl.get_float_attrib(el, 'arrow-head-length', 1),
        'drawStartArrow': False,
        'drawEndArrow': True,
        'originY': 'center',
        'selectable': drawing_defaults['selectable'],
        'type': 'coordinates',
        'gradingName': 'coordinates',
    }
    return obj


def gen_dimensions(el):
    color = pl.get_color_attrib(el, 'stroke-color', 'black')
    offset = pl.get_float_attrib(el, 'dim-offset', 0)
    x1 = pl.get_float_attrib(el, 'x1', drawing_defaults['x1'])
    y1 = pl.get_float_attrib(el, 'y1', drawing_defaults['y1'])
    if 'x2' not in el.attrib:
        w = pl.get_float_attrib(el, 'width', drawing_defaults['force-width'] / 2)
        ang = pl.get_float_attrib(el, 'angle', drawing_defaults['angle'])
        ang_rad = ang * math.pi / 180
        x2 = x1 + w * math.cos(ang_rad)
        y2 = y1 + w * math.sin(ang_rad)
    else:
        x2 = pl.get_float_attrib(el, 'x2')
        y2 = pl.get_float_attrib(el, 'y2', y1)
        ang_rad = math.atan2(y2 - y1, x2 - x1)

    if 'dim-offset-angle' in el.attrib:
        ang = pl.get_float_attrib(el, 'dim-offset-angle')
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
        'x1ref': x1,
        'y1ref': y1,
        'x2ref': x2,
        'y2ref': y2,
        'x1d': float(r1d[0]),
        'y1d': float(r1d[1]),
        'x2d': float(r2d[0]),
        'y2d': float(r2d[1]),
        'stroke': color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', drawing_defaults['stroke-width'] / 2),
        'arrowheadWidthRatio': pl.get_float_attrib(el, 'arrow-head-width', 1.5),
        'arrowheadOffsetRatio': pl.get_float_attrib(el, 'arrow-head-length', 1.5),
        'label': pl.get_string_attrib(el, 'label', ''),
        'offsetx': pl.get_float_attrib(el, 'offsetx', 0),
        'offsety': pl.get_float_attrib(el, 'offsety', 0),
        'xlabel': float(rlabel[0]),
        'ylabel': float(rlabel[1]),
        'drawStartArrow': json.loads(pl.get_string_attrib(el, 'draw-start-arrow', 'true')),
        'drawEndArrow': json.loads(pl.get_string_attrib(el, 'draw-end-arrow', 'true')),
        'startSupportLine': pl.get_boolean_attrib(el, 'start-support-line', False),
        'endSupportLine': pl.get_boolean_attrib(el, 'end-support-line', False),
        'originY': 'center',
        'selectable': drawing_defaults['selectable'],
        'type': 'dimension',
        'gradingName': 'dimension',
    }
    return obj


def gen_arc_dimension(el):
    color = pl.get_color_attrib(el, 'stroke-color', 'black')
    obj = {
        'left': pl.get_float_attrib(el, 'x1', drawing_defaults['x1']),
        'top': pl.get_float_attrib(el, 'y1', drawing_defaults['y1']),
        'angle': pl.get_float_attrib(el, 'angle', drawing_defaults['angle']),
        'radius': pl.get_float_attrib(el, 'radius', drawing_defaults['radius']),
        'startAngle': pl.get_float_attrib(el, 'start-angle', drawing_defaults['angle']),
        'endAngle': pl.get_float_attrib(el, 'end-angle', drawing_defaults['end-angle']),
        'drawCenterPoint': pl.get_boolean_attrib(el, 'draw-center', False),
        'drawStartArrow': pl.get_boolean_attrib(el, 'draw-start-arrow', False),
        'drawEndArrow': pl.get_boolean_attrib(el, 'draw-end-arrow', True),
        'startSupportLine': pl.get_boolean_attrib(el, 'start-support-line', False),
        'endSupportLine': pl.get_boolean_attrib(el, 'end-support-line', False),
        'label': pl.get_string_attrib(el, 'label', drawing_defaults['label']),
        'offsetx': pl.get_float_attrib(el, 'offsetx', 0),
        'offsety': pl.get_float_attrib(el, 'offsety', 0),
        'stroke': color,
        'fill': color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', drawing_defaults['stroke-width'] / 2),
        'arrowheadWidthRatio': pl.get_float_attrib(el, 'arrow-head-width', 1),
        'arrowheadOffsetRatio': pl.get_float_attrib(el, 'arrow-head-length', 1),
        'originY': 'center',
        'selectable': drawing_defaults['selectable'],
        'evented': drawing_defaults['selectable'],
        'type': 'arc-dimension',
        'gradingName': 'arc_dimension',
    }
    return obj


def gen_rectangle(el):
    color = pl.get_color_attrib(el, 'color', 'green1')
    stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
    obj = {
        'left': pl.get_float_attrib(el, 'x1', drawing_defaults['x1']),
        'top': pl.get_float_attrib(el, 'y1', drawing_defaults['y1']),
        'width': pl.get_float_attrib(el, 'width', drawing_defaults['width']),
        'height': pl.get_float_attrib(el, 'height', drawing_defaults['height']),
        'angle': pl.get_float_attrib(el, 'angle', drawing_defaults['angle']),
        'originX': 'center',
        'originY': 'center',
        'fill': color,
        'stroke': stroke_color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', drawing_defaults['stroke-width'] / 2),
        'strokeUniform': True,
        'type': 'rectangle',
        'gradingName': 'rectangle',
        'selectable': pl.get_boolean_attrib(el, 'selectable', drawing_defaults['selectable']),
        'evented': pl.get_boolean_attrib(el, 'selectable', drawing_defaults['selectable']),
    }
    return obj


def gen_triangle(el):
    color = pl.get_color_attrib(el, 'color', 'red1')
    stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
    obj = {
        'p1': {'x': pl.get_float_attrib(el, 'x1', 40), 'y': pl.get_float_attrib(el, 'y1', 40)},
        'p2': {'x': pl.get_float_attrib(el, 'x2', 60), 'y': pl.get_float_attrib(el, 'y2', 40)},
        'p3': {'x': pl.get_float_attrib(el, 'x3', 40), 'y': pl.get_float_attrib(el, 'y3', 20)},
        'fill': color,
        'stroke': stroke_color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', drawing_defaults['stroke-width'] / 2),
        'strokeUniform': True,
        'type': 'triangle',
        'gradingName': 'triangle',
        'selectable': pl.get_boolean_attrib(el, 'selectable', drawing_defaults['selectable']),
        'evented': pl.get_boolean_attrib(el, 'selectable', drawing_defaults['selectable']),
        'originX': 'center',
        'originY': 'center'
    }
    return obj


def gen_circle(el):
    color = pl.get_color_attrib(el, 'color', 'grey')
    stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
    obj = {
        'left': pl.get_float_attrib(el, 'x1', drawing_defaults['x1']),
        'top': pl.get_float_attrib(el, 'y1', drawing_defaults['y1']),
        'radius': pl.get_float_attrib(el, 'radius', drawing_defaults['radius']),
        'label': pl.get_string_attrib(el, 'label', drawing_defaults['label']),
        'offsetx': pl.get_float_attrib(el, 'offsetx', 5),
        'offsety': pl.get_float_attrib(el, 'offsety', 5),
        'originX': 'center',
        'originY': 'center',
        'stroke': stroke_color,
        'fill': color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', drawing_defaults['stroke-width'] / 2),
        'strokeUniform': True,
        'selectable': pl.get_boolean_attrib(el, 'selectable', drawing_defaults['selectable']),
        'evented': pl.get_boolean_attrib(el, 'selectable', drawing_defaults['selectable']),
        'type': 'circle',
        'gradingName': 'circle',
        'scaling': True
    }
    return obj


def gen_polygon(el):
    pointlist = json.loads(pl.get_string_attrib(el, 'plist', '[{"x": 66.21260699999999, "y": 82.746078}, {"x": 25.880586, "y": 78.50701}, {"x": 17.448900000000002, "y": 38.839035}, {"x": 52.569852, "y": 18.561946}, {"x": 82.707481, "y": 45.697991}]'))
    color = pl.get_color_attrib(el, 'color', 'white')
    stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
    obj = {
        'pointlist': pointlist,
        'fill': color,
        'stroke': stroke_color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', 1),
        'strokeUniform': True,
        'type': 'polygon',
        'gradingName': 'polygon',
        'selectable': pl.get_boolean_attrib(el, 'selectable', drawing_defaults['selectable']),
        'evented': pl.get_boolean_attrib(el, 'selectable', drawing_defaults['selectable']),
    }
    return obj


def gen_spring(el):
    stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
    x1 = pl.get_float_attrib(el, 'x1', drawing_defaults['x1'])
    y1 = pl.get_float_attrib(el, 'y1', drawing_defaults['y1'])
    if 'x2' in el.attrib and 'y2' in el.attrib:
        x2 = pl.get_float_attrib(el, 'x2')
        y2 = pl.get_float_attrib(el, 'y2')
    else:
        w = pl.get_float_attrib(el, 'width', drawing_defaults['force-width'])
        angle = pl.get_float_attrib(el, 'angle', drawing_defaults['angle'])
        x2 = x1 + w * math.cos(angle * math.pi / 180)
        y2 = y1 + w * math.sin(angle * math.pi / 180)
    obj = {
        'x1': x1,
        'y1': y1,
        'x2': x2,
        'y2': y2,
        'height': pl.get_float_attrib(el, 'height', drawing_defaults['height']),
        'dx': pl.get_float_attrib(el, 'interval', 10),
        'originX': 'center',
        'originY': 'center',
        'stroke': stroke_color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
        'drawPin': pl.get_boolean_attrib(el, 'draw-pin', False),
        'selectable': drawing_defaults['selectable'],
        'evented': drawing_defaults['selectable'],
        'type': 'spring',
        'gradingName': 'spring',
    }
    return obj


def gen_line(el):
    stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
    x1 = pl.get_float_attrib(el, 'x1', drawing_defaults['x1'])
    y1 = pl.get_float_attrib(el, 'y1', drawing_defaults['y1'])
    if 'x2' in el.attrib and 'y2' in el.attrib:
        x2 = pl.get_float_attrib(el, 'x2')
        y2 = pl.get_float_attrib(el, 'y2')
    else:
        w = pl.get_float_attrib(el, 'width', drawing_defaults['force-width'])
        angle = pl.get_float_attrib(el, 'angle', 0)
        x2 = x1 + w * math.cos(angle * math.pi / 180)
        y2 = y1 + w * math.sin(angle * math.pi / 180)
    if 'dashed-size' in el.attrib:
        dashed_array = [pl.get_float_attrib(el, 'dashed-size'), pl.get_float_attrib(el, 'dashed-size')]
    else:
        dashed_array = None
    obj = {
        'x1': x1,
        'y1': y1,
        'x2': x2,
        'y2': y2,
        'originX': 'center',
        'originY': 'center',
        'stroke': stroke_color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
        'strokeDashArray': dashed_array,
        'selectable': drawing_defaults['selectable'],
        'evented': drawing_defaults['selectable'],
        'type': 'line',
        'gradingName': 'line',
    }
    return obj


def gen_arc(el):
    stroke_color = pl.get_color_attrib(el, 'stroke-color', 'black')
    theta1 = pl.get_float_attrib(el, 'start-angle', drawing_defaults['angle']) * math.pi / 180
    theta2 = pl.get_float_attrib(el, 'end-angle', drawing_defaults['end-angle']) * math.pi / 180
    if 'dashed-size' in el.attrib:
        dashed_array = [pl.get_float_attrib(el, 'dashed-size'), pl.get_float_attrib(el, 'dashed-size')]
    else:
        dashed_array = None
    obj = {
        'left': pl.get_float_attrib(el, 'x1', drawing_defaults['x1']),
        'top': pl.get_float_attrib(el, 'y1', drawing_defaults['y1']),
        'radius': pl.get_float_attrib(el, 'radius', drawing_defaults['radius']),
        'startAngle': theta1,
        'endAngle': theta2,
        'stroke': stroke_color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
        'strokeDashArray': dashed_array,
        'fill': '',
        'selectable': drawing_defaults['selectable'],
        'evented': drawing_defaults['selectable'],
        'originX': 'center',
        'originY': 'center',
        'type': 'simple-arc',
        'gradingName': 'simple-arc',
    }
    return obj


def gen_text(el):
    obj = {
        'left': pl.get_float_attrib(el, 'x1', drawing_defaults['x1']),
        'top': pl.get_float_attrib(el, 'y1', drawing_defaults['y1']),
        'label': pl.get_string_attrib(el, 'label', ' Text '),
        'offsetx': pl.get_float_attrib(el, 'offsetx', 0),
        'offsety': pl.get_float_attrib(el, 'offsety', 0),
        'fontSize': pl.get_float_attrib(el, 'font-size', drawing_defaults['font-size']),
        'latex': pl.get_boolean_attrib(el, 'latex', True),
        'type': 'text',
        'gradingName': 'text',
    }
    return obj


def gen_axes(el):
    if 'origin' in el.attrib:
        origin = json.loads(pl.get_string_attrib(el, 'origin'))
        origin_x = origin['x']
        origin_y = origin['y']
    else:
        origin_x = origin_y = 60

    color = pl.get_color_attrib(el, 'color', 'black')
    obj = {
        'left': origin_x,
        'top': origin_y,
        'xneg': pl.get_float_attrib(el, 'xneg', 20),
        'xpos': pl.get_float_attrib(el, 'xpos', 400),
        'yneg': pl.get_float_attrib(el, 'yneg', 160),
        'ypos': pl.get_float_attrib(el, 'ypos', 160),
        'supporting_lines': json.loads(pl.get_string_attrib(el, 'supporting-lines', '{}')),
        'label_list': json.loads(pl.get_string_attrib(el, 'grid-label', '{}')),
        'labelx': pl.get_string_attrib(el, 'label-x', 'x'),
        'labely': pl.get_string_attrib(el, 'label-y', 'y'),
        'offsetx_label_x': pl.get_float_attrib(el, 'offsetx-label-x', 0),
        'offsety_label_x': pl.get_float_attrib(el, 'offsety-label-x', 0),
        'offsetx_label_y': pl.get_float_attrib(el, 'offsetx-label-y', -30),
        'offsety_label_y': pl.get_float_attrib(el, 'offsety-label-y', -10),
        'stroke': color,
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', drawing_defaults['stroke-width']),
        'originY': 'center',
        'selectable': drawing_defaults['selectable'],
        'evented': drawing_defaults['selectable'],
        'type': 'axes',
        'gradingName': 'axes',
    }
    return obj


def gen_graph_line(el):
    curved_line = False

    if 'origin' in el.attrib:
        origin = json.loads(pl.get_string_attrib(el, 'origin'))
        x0 = origin['x']
        y0 = origin['y']
    else:
        x0 = y0 = 0

    if 'end-points' in el.attrib:
        line = json.loads(pl.get_string_attrib(el, 'end-points'))
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
            line = json.loads(pl.get_string_attrib(el, 'end-gradients'))
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

    offset_x = pl.get_float_attrib(el, 'offset-tol-x', 0)
    offset_y = pl.get_float_attrib(el, 'offset-tol-y', 0)
    offset_control_x = pl.get_float_attrib(el, 'offset-control-tol-x', 0)
    offset_control_y = pl.get_float_attrib(el, 'offset-control-tol-y', 0)
    grid_size = pl.get_integer_attrib(el, 'grid-size', 20)
    tol = pl.get_float_attrib(el, 'tol', grid_size / 2)

    # Defining the error boxes for end points
    wbox = 2 * tol + 2 * offset_x
    hbox = 2 * tol + 2 * offset_y
    # Defining the error box for the control point
    wbox_c = 2 * tol + 2 * offset_control_x
    hbox_c = 2 * tol + 2 * offset_control_y

    obj = {
        'x1': x0 + x1,
        'y1': y0 - y1,
        'stroke': pl.get_color_attrib(el, 'color', 'red'),
        'strokeWidth': pl.get_float_attrib(el, 'stroke-width', 4),
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


def generate_element(element, name, defaults={}):
    if name in gen:
        obj = defaults.copy()
        obj.update(gen[name](element))
        return obj
    else:
        return None
