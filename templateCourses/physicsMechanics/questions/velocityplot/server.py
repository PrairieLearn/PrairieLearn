import random

import numpy as np


def generate(data):

    # We can select the plot to show acceleration or velocity
    problem = "vel"  # this variable can be "accel" or "vel"
    # this is the initial velocity or initial position of the vehicle
    initial = random.randint(1, 6)
    data["params"]["initial"] = initial
    # This is the time where we want the variable to be computed
    time = random.randint(11, 19)
    data["params"]["time"] = time
    # Each square represents on unit in both x and y directions
    ratio = 20
    # space to define time interval
    T = 100  # each time interval will have 5 squares

    # Values for either acceleration or velocity for the interval ends
    v0 = random.choice([40, 60, 80, 100, 120])
    v1 = random.choice([-1, 1]) * random.choice([40, 60, 80, 100, 120])
    v2 = v1  # constant interval
    if random.choice([0, 1]):
        v2 = random.choice([-1, 1]) * random.choice([40, 60, 80, 100, 120])
    v3 = random.choice([-1, 1]) * random.choice([40, 60, 80, 100, 120])
    if v3 == v2:
        v3 = v2 + 40
    v4 = v3  # constant interval
    if random.choice([0, 1]):
        v4 = random.choice([-1, 1]) * random.choice([40, 60, 80, 100, 120])

    # Computing the slopes
    s1 = (v1 - v0) / (T)
    s2 = (v2 - v1) / (T)
    s3 = (v3 - v2) / (T)
    s4 = (v4 - v3) / (T)
    # Computing the correct answer (areas under the curve)
    A1 = v0 * T / (ratio**2) + s1 / 2 * (T / ratio) ** 2
    A2 = v1 * T / (ratio**2) + s2 / 2 * (T / ratio) ** 2
    A3 = v2 * T / (ratio**2) + s3 / 2 * (T / ratio) ** 2
    if time > 15:
        dt = time - 15
        da = v3 / ratio * dt + s4 / 2 * (dt) ** 2
        A = A1 + A2 + A3 + da
    else:
        dt = time - 10
        da = v2 / ratio * dt + s3 / 2 * (dt) ** 2
        A = A1 + A2 + da
    # Final variable of interest (velocity or position)
    data["correct_answers"]["ans"] = initial + A

    #########################################################
    # variables for the plot - NO NEED TO MODIFY CODE BELOW
    #########################################################

    if problem == "accel":
        data["params"]["ylab"] = "a(t)"
    else:
        data["params"]["ylab"] = "v(t)"
    """
    Origin of the plot
    This is the origin of the axes wrt the (top,left) of the canvas
    """
    # origin
    Ori = np.array([80, 200])
    data["params"]["V_origin"] = create_dict_xy_coord(Ori)

    """
    All the following positions are measured wrt the origin of the plot
    """

    """Interval 1:"""
    # first point of the interval
    p0 = np.array([0, v0])
    # second point of the interval
    p1 = np.array([T, v1])
    # data params (no need to change this)
    data["params"]["V1"] = (
        "[" + create_dict_xy_coord(p0) + "," + create_dict_xy_coord(p1) + "]"
    )
    # labels
    data["params"]["lp0"] = create_label_list(Ori, p0, ratio, -40, -10)
    data["params"]["lp1"] = create_label_list(Ori, p1, ratio)

    """Interval 2:"""
    # second point of the interval
    p2 = np.array([2 * T, v2])
    # data params (no need to change this)
    data["params"]["V2"] = (
        "[" + create_dict_xy_coord(p1) + "," + create_dict_xy_coord(p2) + "]"
    )
    # labels
    data["params"]["lp2"] = create_label_list(Ori, p2, ratio)

    """Interval 3:"""
    # second point of the interval
    p3 = np.array([3 * T, v3])
    # data params (no need to change this)
    data["params"]["V3"] = (
        "[" + create_dict_xy_coord(p2) + "," + create_dict_xy_coord(p3) + "]"
    )
    # labels
    data["params"]["lp3"] = create_label_list(Ori, p3, ratio)

    """Interval 4:"""
    # second point of the interval
    p4 = np.array([4 * T, v4])
    # data params (no need to change this)
    data["params"]["V4"] = (
        "[" + create_dict_xy_coord(p3) + "," + create_dict_xy_coord(p4) + "]"
    )
    data["params"]["lp4"] = create_label_list(Ori, p4, ratio, 10, -10)

    return data


def create_label_list(Ori, p, ratio, ox=5, oy=-30):
    x1 = int(Ori[0] + p[0])
    y1 = int(Ori[1] - p[1])
    return [
        x1,
        y1,
        "(" + str(int(p[0] / ratio)) + "," + str(int(p[1] / ratio)) + ")",
        ox,
        oy,
    ]


def create_dict_xy_coord(p):
    return '{"x": ' + str(p[0]) + ',"y": ' + str(p[1]) + "}"
