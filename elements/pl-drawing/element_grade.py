import numpy as np

tol = 0
angtol = 0


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


def set_grading_tol(tol_, angtol_):
    global tol, angtol
    tol = tol_
    angtol = angtol_


def grade_element(reference, element, name):
    if name in comp:
        return comp[name](reference, element)
    else:
        return False


def can_grade(name):
    return name in comp
