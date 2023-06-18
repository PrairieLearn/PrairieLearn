import random

import numpy as np
import prairielearn as pl


def generate(data):
    angle = 0

    while angle < 0.1 or abs(angle - 0.5 * np.pi) < 0.1 or angle > 0.8 * np.pi:
        rOP = np.array([random.randint(-2, 2), random.randint(1, 3), 0])
        rPQ = randIntNonZeroArray(2, -2, 2)
        rOPAngle = np.arctan2(rOP[1], rOP[0])
        rPQAngle = np.arctan2(rPQ[1], rOP[1])

        if rOPAngle < 0:
            rOPAngle += 2 * np.pi

        if rPQAngle < 0:
            rPQAngle += 2 * np.pi

        angle = rOPAngle - rPQAngle

    m1 = 0
    m2 = 0

    while m1 == m2:
        m1 = random.randint(2, 9)
        m2 = random.randint(2, 9)

    rOC1 = 0.5 * rOP
    rOC2 = rOP + 0.5 * rPQ
    g = 9.8

    V = m1 * g * rOC1[1] + m2 * g * rOC2[1]

    # for pl-drawing
    O = np.zeros(3)
    rP = rOP
    rQ = rOP + rPQ

    [bottomLeft, bottomRight, topLeft, topRight, center, extent] = boundingBox2D(
        [O, rP, rQ]
    )

    C = center

    translated_points = bboxTranslate(C, [O, rP, rQ], 251, 155, 40)

    Ox = translated_points[0][0]
    Oy = translated_points[0][1]

    Px = translated_points[1][0]
    Py = translated_points[1][1]

    Qx = translated_points[2][0]
    Qy = translated_points[2][1]

    data["params"]["Ox"] = Ox
    data["params"]["Oy"] = Oy
    data["params"]["Px"] = Px
    data["params"]["Py"] = Py
    data["params"]["Qx"] = Qx
    data["params"]["Qy"] = Qy

    data["params"]["rOPvec"] = cartesianVector(rOP)
    data["params"]["rPQvec"] = cartesianVector(rPQ)

    data["params"]["rOP"] = pl.to_json(rOP)
    data["params"]["rPQ"] = pl.to_json(rPQ)
    data["params"]["m1"] = float(m1)
    data["params"]["m2"] = float(m2)

    data["correct_answers"]["V"] = V

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


def bboxTranslate(C, points, offsetx, offsety, width=30):
    translated_points = []
    """C: Center of the bounding box as a numpy array
    points: List of vectors to offset from the center
    offsetx: The x-offset from the top left corner, usually half the width of the figure
    offsety: The y-offset from the top left corner, usually half the height of the figure
    width: Width of the vector offset, default 30

    returns the 2D offset (corrected) points for pl-drawing"""

    for i in range(len(points)):
        x_translated = offsetx + width * (points[i][0] - C[0])
        y_translated = offsety - width * (points[i][1] - C[1])
        translated_points.append(np.array(([x_translated, y_translated, 0])))

    return translated_points
