import random

import numpy as np
import prairielearn as pl


def generate(data):
    omega1 = np.array([0, 0, randIntNonZero(-3, 3)])
    omega2 = np.array([0, 0, randIntNonZero(-3, 3)])

    rOP = np.zeros(3)
    rPQ = np.zeros(3)
    angle = np.arctan2(rOP[1], rOP[0]) - np.arctan2(rPQ[1], rPQ[0])

    while angle < 0.1 or abs(angle - 0.5 * np.pi) < 0.1 or angle > 0.8 * np.pi:
        rOP = np.array([random.randint(-2, 2), random.randint(1, 3), 0])
        rPQ = randIntNonZeroArray(2, -2, 2)
        angle = np.arctan2(rOP[1], rOP[0]) - np.arctan2(rPQ[1], rPQ[0])

    vP = np.cross(omega1, rOP)
    vQ = vP + np.cross(omega2, rPQ)

    findVar = random.choice(["\\vec{\\omega}_1", "\\vec{\\omega}_2"])
    if findVar == "\\vec{\\omega}_1":
        omega = omega1[2]
    else:
        omega = omega2[2]

    O = np.zeros(3)
    rP = rOP
    rQ = rOP + rPQ

    [bottomLeft, bottomRight, topLeft, topRight, center, extent] = boundingBox2D(
        [O, rP, rQ]
    )

    C = center

    Ox = 256 + 22 * (O[0] - C[0])
    Oy = 175 - 22 * (O[1] - C[1])

    Px = 256 + 22 * (rP[0] - C[0])
    Py = 175 - 22 * (rP[1] - C[1])

    Qx = 256 + 22 * (rQ[0] - C[0])
    Qy = 175 - 22 * (rQ[1] - C[0])

    [vQ_angle, vQ_PL_angle] = angleOf(vQ)

    data["params"]["Ox"] = Ox
    data["params"]["Oy"] = Oy
    data["params"]["Px"] = Px
    data["params"]["Py"] = Py
    data["params"]["Qx"] = Qx
    data["params"]["Qy"] = Qy
    data["params"]["rOP_vec"] = cartesianVector(rOP)
    data["params"]["rPQ_vec"] = cartesianVector(rPQ)
    data["params"]["vQ_vec"] = cartesianVector(vQ)
    data["params"]["rOP"] = pl.to_json(rOP)
    data["params"]["rPQ"] = pl.to_json(rPQ)
    data["params"]["vQ"] = pl.to_json(vQ)
    data["params"]["findVar"] = findVar

    data["params"]["vQ_angle"] = vQ_PL_angle
    data["params"]["vQ_width"] = 10 * np.linalg.norm(vQ)

    data["correct_answers"]["omega"] = float(omega)

    return data


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


def randIntNonZero(a, b):
    """a: lower bound of the range of integers
       b: upper bound of the range of integers
    returns a non-zero integer in the range [a,b]
    """

    x = 0
    while x == 0:
        x = random.randint(a, b)

    return x


def randIntNonZeroArray(n, a, b, step=1):

    """n: size of the array
       a: lower bound of the range of integers
       b : upper bound of the range of integers
    returns a non-zero vector whose components are integers in the range [a,b]

    """

    r = np.zeros(n)

    while np.linalg.norm(r) == 0:
        if n == 2:
            r = np.array(
                [random.randrange(a, b, step), random.randrange(a, b, step), 0]
            )
        elif n == 3:
            r = np.array(
                [
                    random.randrange(a, b, step),
                    random.randrange(a, b, step),
                    random.randrange(a, b, step),
                ]
            )

    return r


def boundingBox2D(points):
    xMin = points[0][0]
    xMax = points[0][0]
    yMin = points[0][1]
    yMax = points[0][1]
    for i in range(1, len(points)):
        xMin = min(xMin, points[i][0])
        xMax = max(xMax, points[i][0])
        yMin = min(yMin, points[i][1])
        yMax = max(yMax, points[i][1])

    bottomLeft = np.array([xMin, yMin, 0])
    bottomRight = np.array([xMax, yMin, 0])
    topLeft = np.array([xMin, yMax, 0])
    topRight = np.array([xMax, yMax, 0])
    center = np.array([(xMin + xMax) / 2, (yMin + yMax) / 2, 0])
    extent = np.array([xMax - xMin, yMax - yMin])

    return bottomLeft, bottomRight, topLeft, topRight, center, extent


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
