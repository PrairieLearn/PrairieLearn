import random

import numpy as np
import prairielearn as pl


def generate(data):
    pythTriples = [
        [3, 4, 5],
        [6, 8, 10],
        [5, 12, 13],
        [9, 12, 15],
        [8, 15, 17],
        [12, 16, 20],
        [7, 24, 25],
    ]
    triple = random.choice(pythTriples)
    rCQchoice = triple[slice(0, 2)]
    rCQElem = random.sample(rCQchoice, 2)
    rCQ = np.array(
        [random.choice([-1, 1]) * rCQElem[0], random.choice([-1, 1]) * rCQElem[1], 0]
    )
    rPC = np.array([0, triple[2], 0])
    rPQ = rPC + rCQ

    omega = np.array([0, 0, randIntNonZero(-5, 5)])
    vQ = np.cross(omega, rPQ)

    data["params"]["rCQ_vec"] = cartesianVector(rCQ)
    data["params"]["vQ_vec"] = cartesianVector(vQ)

    data["params"]["rCQ"] = pl.to_json(rCQ)
    data["params"]["vQ"] = pl.to_json(vQ)

    r = triple[2]

    if r == 13 or r == 15 or r == 17 or r == 20:
        data["params"]["r"] = 5 * r
    elif r == 10:
        data["params"]["r"] = 10 * r
    elif r == 25:
        data["params"]["r"] = 5 * r
    else:
        data["params"]["r"] = 12 * r

    data["params"]["Qx"] = float(300 + data["params"]["r"] / r * rCQ[0])
    data["params"]["Qy"] = float(150 - data["params"]["r"] / r * rCQ[1])
    Px = 300
    data["params"]["Px"] = float(Px)
    if r == 5:
        Py = float(150 + data["params"]["r"] + 0.5 * r)
    elif r == 10:
        Py = float(150 + data["params"]["r"] + 0.3 * r)
    else:
        Py = float(150 + data["params"]["r"] + 0.2 * r)

    data["params"]["Py"] = Py

    rCQangle = np.arctan2(rCQ[1], rCQ[0]) * 180 / np.pi
    vQangle = np.arctan2(vQ[1], vQ[0]) * 180 / np.pi

    if rCQangle < 0:
        rCQangle = abs(rCQangle)
    else:
        rCQangle = -rCQangle

    if vQangle < 0:
        vQangle = abs(vQangle)
    else:
        vQangle = -vQangle

    data["params"]["rCQangle"] = rCQangle
    data["params"]["vQangle"] = vQangle
    data["params"]["vQwidth"] = np.linalg.norm(vQ)
    data["params"]["rCQwidth"] = np.linalg.norm(rCQ) * data["params"]["r"] / r
    drawGround = ground(
        np.array([300, 150 + data["params"]["r"]]), np.array([0, 1, 0]), 1000
    )
    data["params"]["drawGround"] = drawGround

    data["correct_answers"]["omega"] = float(omega[2])

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


def perp(v):
    """v: numpy array of size (n,)
       n: size of the array
    returns the counterclockwise orthogonal vector to v
    """
    return np.array([-v[1], v[0], 0])


def ground(P, en, width):
    """
    P: Location of the ground's center, in PL coordinates as a list or np.array
    en: normal vector of the ground
    width: width of the ground
    returns the pl-drawing code to draw the ground
    NOTE: deprecated, still used in several questions. should be replaced with groundAtAngle()
    """

    offsetx = 6
    offsety = 6

    if np.linalg.norm(en) != 0:
        en = en / np.linalg.norm(en)

    [en_angle, en_PL_angle] = angleOf(en)
    [et_angle, et_PL_angle] = angleOf(perp(en))

    linex1 = P[0] - width / 2 * np.cos(et_angle)
    liney1 = P[1] - width / 2 * np.sin(et_angle)

    linex2 = P[0] + width / 2 * np.cos(et_angle)
    liney2 = P[1] + width / 2 * np.sin(et_angle)

    rectx = P[0] - offsetx * np.sin(et_angle)
    recty = P[1] - offsety * np.cos(et_angle)

    drawGround = f'<pl-line x1={linex1} y1={liney1} x2={linex2} y2={liney2}></pl-line>\n<pl-rectangle x1={rectx} y1={recty} width={width} height="10" angle={et_PL_angle} stroke-width="0" color="#DCDCDC"></pl-rectangle>'

    return drawGround
