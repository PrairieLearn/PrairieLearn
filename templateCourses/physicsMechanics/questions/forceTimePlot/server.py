import random

import numpy as np


def generate(data):

    ratiox = 100
    ratioy = 10
    # space to define time interval
    T = 100  # each time interval will have 5 squares
    # Values for the forces for the interval ends
    v0 = 0
    v1 = random.choice([60, 80, 100, 120])
    v2 = v1  # constant interval
    if random.choice([0, 1]):
        v2 = random.choice([60, 80, 100, 120])
    v3 = 0
    # decide where the two mid-point are located
    mid = random.sample(set([1, 2, 3]), 2)
    mid.sort()
    # Computing the slopes
    s1 = (ratiox / ratioy) * (v1 - v0) / (mid[0] * T)
    s2 = (ratiox / ratioy) * (v2 - v1) / ((mid[1] - mid[0]) * T)
    s3 = (ratiox / ratioy) * (v3 - v2) / ((4 - mid[1]) * T)
    # Computing the correct answer (impulse is the sum of the areas under the curve)
    A1 = v0 * mid[0] * T / (ratiox**ratioy) + s1 / 2 * ((mid[0] * T) ** 2) / (
        ratiox**2
    )
    A2 = (
        v1 * (mid[1] - mid[0]) * T / (ratiox * ratioy)
        + (s2 / 2) * ((mid[1] - mid[0]) * T / ratiox) ** 2
    )
    A3 = (
        v2 * (4 - mid[1]) * T / (ratiox * ratioy)
        + s3 / 2 * ((4 - mid[1]) * T / ratiox) ** 2
    )
    # impulse
    data["correct_answers"]["ans"] = A1 + A2 + A3

    # #########################################################
    # # variables for the plot - NO NEED TO MODIFY CODE BELOW
    # #########################################################
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
    p1 = np.array([mid[0] * T, v1])
    # data params (no need to change this)
    data["params"]["V1"] = (
        "[" + create_dict_xy_coord(p0) + "," + create_dict_xy_coord(p1) + "]"
    )

    """Interval 2:"""
    # second point of the interval
    p2 = np.array([mid[1] * T, v2])
    # data params (no need to change this)
    data["params"]["V2"] = (
        "[" + create_dict_xy_coord(p1) + "," + create_dict_xy_coord(p2) + "]"
    )

    """Interval 3:"""
    # second point of the interval
    p3 = np.array([4 * T, v3])
    # data params (no need to change this)
    data["params"]["V3"] = (
        "[" + create_dict_xy_coord(p2) + "," + create_dict_xy_coord(p3) + "]"
    )

    """ Defining labels for the axes """
    # x-axis label
    loc_x = [T, 2 * T, 3 * T, 4 * T]  # location of the text
    lab_x = ["1", "2", "3", "4"]  # text
    # y-axis label
    if v1 == v2:
        loc_y = [v1]  # location of the text
        lab_y = [str(v1 / ratioy)]  # text
    else:
        loc_y = [v1, v2]  # location of the text
        lab_y = [str(v1 / ratioy), str(v2 / ratioy)]  # text
    # data params (no need to change this)
    supp_lines = "["
    labels = "["
    for i in range(len(loc_x)):
        labels += create_dict_labels("x", loc_x[i], lab_x[i])
        labels += ","
    for i in range(len(loc_y)):
        labels += create_dict_labels("y", loc_y[i], lab_y[i], offsetx=-20)
        supp_lines += '{"y": ' + str(loc_y[i]) + "}"
        if i != len(loc_y) - 1:
            labels += ","
            supp_lines += ","
    labels += "]"
    supp_lines += "]"

    data["params"]["label_V"] = labels
    data["params"]["supp_lines"] = supp_lines

    return data


def create_dict_labels(axis, loc, lab, offsetx=None, offsety=None):
    text = '{"axis": "' + axis + '", "pos": ' + str(loc) + ', "lab": "' + lab + '" '
    if offsetx is not None:
        text += ', "offsetx": ' + str(offsetx)
    if offsety is not None:
        text += ', "offsety": ' + str(offsety)
    text += "}"
    return text


def create_dict_xy_coord(p):
    return '{"x": ' + str(p[0]) + ',"y": ' + str(p[1]) + "}"
