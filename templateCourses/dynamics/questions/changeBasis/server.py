import random

import numpy as np
import prairielearn as pl


def generate(data):
    theta = (random.randint(4, 7) * 10 + random.choice([0, 90])) * random.choice(
        [-1, 1]
    )
    thetaAbs = abs(theta)

    r = np.array([randIntNonZero(-3, 3), randIntNonZero(-3, 3), 0])

    u = vector2DAtAngle(np.radians(theta))
    v = perp(u)

    ru = np.dot(r, u)
    rv = np.dot(r, v)

    [uAngle, uPLAngle] = angleOf(u)
    [vAngle, vPLAngle] = angleOf(v)
    [rAngle, rPLAngle] = angleOf(r)

    data["params"]["u_theta"] = uPLAngle
    data["params"]["v_theta"] = vPLAngle
    data["params"]["r_theta"] = rPLAngle
    data["params"]["thetaAbs"] = thetaAbs
    data["params"]["r_vec"] = cartesianVector(r)
    data["params"]["r"] = pl.to_json(r)

    data["correct_answers"]["ru"] = ru
    data["correct_answers"]["rv"] = rv

    data["params"]["rwidth"] = 44 * np.linalg.norm(r)

    if theta > 0:
        startAngle = uPLAngle
        endAngle = 0
        offsetx = 5
        offsety = -5
        drawStartArrow = "true"
        drawEndArrow = "false"
    else:
        startAngle = 0
        endAngle = uPLAngle
        offsetx = 10
        offsety = 10
        drawStartArrow = "false"
        drawEndArrow = "true"

    data["params"]["startAngle"] = startAngle
    data["params"]["endAngle"] = endAngle
    data["params"]["offsetx"] = offsetx
    data["params"]["offsety"] = offsety
    data["params"]["drawStartArrow"] = drawStartArrow
    data["params"]["drawEndArrow"] = drawEndArrow

    return data


def randIntNonZero(a, b):
    """a: lower bound of the range of integers
       b: upper bound of the range of integers
    returns a non-zero integer in the range [a,b]
    """

    x = 0
    while x == 0:
        x = random.randint(a, b)

    return x


def vectorInBasis(v, basis1, basis2, basis3):
    """v: numpy array of size (3,)
    basis1: first basis vector
    basis2: second basis vector
    basis3: third basis vector, default ""
    """

    basis_list = [basis1, basis2, basis3]
    s = []
    e = 0
    v = v.tolist()
    for i in range(len(v)):
        if type(v[i]) == float:
            if v[i] == int(v[i]):
                v[i] = int(v[i])
        e = str(v[i])
        if e == "0":
            continue
        if e == "1" and basis_list[i] != "":
            e = ""
        if e == "-1" and basis_list[i] != "":
            e = "-"
        e += basis_list[i]
        if len(s) > 0 and e[0] != "-":
            e = "+" + e
        s.append(e)
    if len(s) == 0:
        s.append("0")
    return "".join(s)


def cartesianVector(v):
    return vectorInBasis(v, "\\hat{\\imath}", "\\hat{\\jmath}", "\\hat{k}")


def perp(v):
    """v: numpy array of size (n,)
       n: size of the array
    returns the counterclockwise orthogonal vector to v
    """
    return np.array([-v[1], v[0], 0])


def angleOf(v):
    """v: vector of size (n,)
    returns the true angle of the vector with respect to the x-axis, in radians
    returns the adjusted angle for pl-drawing, in degrees"""
    trueAngle = np.arctan2(v[1], v[0])
    plAngle = 0

    if trueAngle < 0:
        plAngle = abs(trueAngle)
    else:
        plAngle = -trueAngle

    return trueAngle, np.degrees(plAngle)


def vector2DAtAngle(x):
    """x: angle measured from the x-axis, in radians
    returns unit vector of size (3,)"""
    return np.array([np.cos(x), np.sin(x), 0])
