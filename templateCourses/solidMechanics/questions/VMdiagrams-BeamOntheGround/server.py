import math
import random

import numpy as np


def create_dict_xy_coord(p):
    return '{"x": ' + str(p[0]) + ',"y": ' + str(p[1]) + "}"


def create_dict_labels(axis, loc, lab, offsetx=None, offsety=None):
    text = '{"axis": "' + axis + '", "pos": ' + str(loc) + ', "lab": "' + lab + '" '
    if offsetx is not None:
        text += ', "offsetx": ' + str(offsetx)
    if offsety is not None:
        text += ', "offsety": ' + str(offsety)
    text += "}"
    return text


def generate(data):

    """
    Parameters of the question. These are usually randomized.
    """

    # will be deleted.
    a = 100  # spacing along the beam

    l = 300
    w = 1.5  # I may wanna delete this soon:: distributed load

    x1 = 80
    y1 = 100
    data["params"]["a"] = a
    data["params"]["x1"] = x1
    data["params"]["x2"] = x1 + 0.2 * l
    data["params"]["x3"] = x1 + 0.8 * l
    data["params"]["x4"] = x1 + l

    data["params"]["y1"] = y1
    data["params"]["rec_width"] = l
    data["params"]["rec_height"] = 20

    data["params"]["ground_width"] = l + 60
    data["params"]["ground_height"] = 20

    data["params"]["xm"] = x1 + 0.5 * l
    data["params"]["ym"] = y1
    data["params"]["y_ground"] = y1 + 20

    Py1 = y1 - 60

    data["params"]["Px1"] = x1 + 0.2 * l
    data["params"]["Px2"] = x1 + 0.8 * l
    data["params"]["Py1"] = Py1
    data["params"]["Py2"] = Py1
    data["params"]["y_dim"] = y1 - 20

    """####
    Parameters for drawing...
    numbers are only for drawing, otherwise values are nonsense
    #######
    """

    """
    ######################################################################
    CREATING FREEBODY DIAGRAM
    ######################################################################
    """
    y_fbd = y1 + 20 * 11
    data["params"]["y_fbd"] = y_fbd
    data["params"]["dist_load_width"] = l

    """
    ######################################################################
    CREATING THE SHEAR DIAGRAM
    ######################################################################
    """

    P = 200  # concentrated load,  this number will be only used for drawing

    """
    Origin of V-plot
    This is the origin of the axes wrt the (top,left) of the canvas
    """
    # origin
    V0 = [x1, 600]
    # data params (no need to change this)
    data["params"]["V_origin"] = create_dict_xy_coord(V0)

    """
    All the following positions are measured wrt the origin of the V-plot
    """

    """Interval 1:"""
    # first point of the interval
    p1 = [0, 0]
    # second point of the interval
    p2 = [0.2 * l, 0.4 * P]
    # data params (no need to change this)
    data["params"]["V1"] = (
        "[" + create_dict_xy_coord(p1) + "," + create_dict_xy_coord(p2) + "]"
    )

    """Interval 2:"""
    # first point of the interval
    p1 = [0.2 * l, -0.6 * P]
    # second point of the interval
    p2 = [0.8 * l, 0.6 * P]
    # data params (no need to change this)
    data["params"]["V2"] = (
        "[" + create_dict_xy_coord(p1) + "," + create_dict_xy_coord(p2) + "]"
    )

    """Interval 2:"""
    # first point of the interval
    p1 = [0.8 * l, -0.4 * P]
    # second point of the interval
    p2 = [l, 0]
    # data params (no need to change this)
    data["params"]["V3"] = (
        "[" + create_dict_xy_coord(p1) + "," + create_dict_xy_coord(p2) + "]"
    )

    """ Defining labels for the axes """
    # x-axis label
    loc_x = [0.2 * l, 0.8 * l, l]  # location of the text
    lab_x = ["0.2L", "0.8L", "L"]  # text
    # y-axis label
    loc_y = [0.6 * P, 0.4 * P, -0.4 * P, -0.6 * P]  # location of the text
    lab_y = ["0.6P", "0.4P", "-0.4P", "-0.6P"]  # text
    # data params (no need to change this)
    labels = "["
    for i in range(len(loc_x)):
        labels += create_dict_labels("x", loc_x[i], lab_x[i])
        labels += ","
    for i in range(len(loc_y)):
        labels += create_dict_labels("y", loc_y[i], lab_y[i], offsetx=-20)
        if i != len(loc_y) - 1:
            labels += ","
    labels += "]"
    data["params"]["label_V"] = labels

    """ Defining the supporting lines"""
    line_perp_x = [0.2 * l, 0.8 * l, 1.0 * l]
    line_perp_y = [0.4 * P, 0.6 * P, -0.4 * P, -0.6 * P]

    sup_line = "["
    for i in range(len(line_perp_x)):
        sup_line += '{"x": ' + str(line_perp_x[i]) + "}"
        sup_line += ","
    for i in range(len(line_perp_y)):
        sup_line += '{"y": ' + str(line_perp_y[i]) + "}"
        sup_line += ","
    sup_line = sup_line.rstrip(",")
    sup_line += "]"
    data["params"]["sup_line"] = sup_line

    """
    ######################################################################
    CREATING THE MOMENT DIAGRAM
    ######################################################################
    """

    """
    Origin of M-plot
    This is the origin of the axes wrt the (top,left) of the canvas
    """
    # origin
    M0 = [80, 1000]
    # data params (no need to change this)
    data["params"]["M_origin"] = create_dict_xy_coord(M0)

    """
    All the following positions are measured wrt the origin of the V-plot
    """
    """Interval 1:"""
    PL = 2000  # determines the scale
    # first point of the interval
    p1 = [0, 0]
    # second point of the interval
    p2 = [0.2 * l, 0.04 * PL]
    # data params (no need to change this)
    # data["params"]["M1"] = '[' + create_dict_xy_coord(p1) + ',' + create_dict_xy_coord(p2) + ']'
    # gradient of the first point of the interval
    g1 = 0
    # gradient of the second point of the interval
    g2 = 5
    # data params (no need to change this)
    data["params"]["dM1"] = "[" + str(g1) + "," + str(g2) + "]"
    data["params"]["M1"] = (
        "[" + create_dict_xy_coord(p1) + "," + create_dict_xy_coord(p2) + "]"
    )

    """Interval 2:"""
    # first point of the interval
    p1 = [0.2 * l, 0.04 * PL]
    # second point of the interval
    p2 = [0.8 * l, 0.04 * PL]
    g1 = -3
    g2 = 3
    # data params (no need to change this)
    data["params"]["dM2"] = "[" + str(g1) + "," + str(g2) + "]"
    data["params"]["M2"] = (
        "[" + create_dict_xy_coord(p1) + "," + create_dict_xy_coord(p2) + "]"
    )

    """Interval 3:"""
    # first point of the interval
    p1 = [0.8 * l, 0.04 * PL]
    # second point of the interval
    p2 = [l, 0]
    # data params (no need to change this)
    # data["params"]["M1"] = '[' + create_dict_xy_coord(p1) + ',' + create_dict_xy_coord(p2) + ']'
    # gradient of the first point of the interval
    g1 = -5
    # gradient of the second point of the interval
    g2 = 0
    # data params (no need to change this)
    data["params"]["dM3"] = "[" + str(g1) + "," + str(g2) + "]"
    data["params"]["M3"] = (
        "[" + create_dict_xy_coord(p1) + "," + create_dict_xy_coord(p2) + "]"
    )

    """ Defining labels for the axes """
    # x-axis label
    loc_x = [0.2 * l, 0.8 * l, 1.0 * l]  # location of the text
    lab_x = ["0.2L", "0.8L", "L"]  # text
    # y-axis label
    loc_y = [0.04 * PL, -0.04 * PL]
    # location of the text
    lab_y = ["0.04PL", "-0.04PL"]  # text
    # data params (no need to change this)
    labels = "["
    for i in range(len(loc_x)):
        labels += create_dict_labels("x", loc_x[i], lab_x[i])
        labels += ","
    for i in range(len(loc_y)):
        labels += create_dict_labels("y", loc_y[i], lab_y[i], offsetx=-20)
        if i != len(loc_y) - 1:
            labels += ","
    labels += "]"

    data["params"]["label_M"] = labels

    """ Defining the supporting lines"""
    line_perp_x = [0.2 * l, 0.8 * l, 1.0 * l]
    line_perp_y = [0.04 * PL, -0.04 * PL]
    sup_line = "["
    for i in range(len(line_perp_x)):
        sup_line += '{"x": ' + str(line_perp_x[i]) + "}"
        sup_line += ","
    for i in range(len(line_perp_y)):
        sup_line += '{"y": ' + str(line_perp_y[i]) + "}"
        sup_line += ","
    sup_line = sup_line.rstrip(",")
    sup_line += "]"
    data["params"]["sup_line_M"] = sup_line

    return data
