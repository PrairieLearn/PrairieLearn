import random

import numpy as np
import prairielearn as pl


def generate(data):
    rPA = randIntNonZeroArray(2, -3, 3)
    rQA = randIntNonZeroArray(2, -3, 3)
    vP = randIntNonZeroArray(2, -3, 3)
    vQ = randIntNonZeroArray(2, -3, 3)
    P = np.zeros(3)
    A = P + rPA
    Q = A - rQA
    PPV = P + vP
    QPV = Q + vQ

    [bottomLeft, bottomRight, topLeft, topRight, center, extent] = boundingBox2D(
        [P, A, Q, PPV, QPV]
    )
    maxExtent = max(extent[0], extent[1])

    while (
        maxExtent < 4
        or maxExtent > 9
        or abs(cross2DOut(rPA, rQA)) < 1
        or abs(cross2DOut(vP, vQ)) < 1
        or abs(cross2DOut(rPA, vP)) < 1
        or abs(cross2DOut(rQA, vQ)) < 1
        or abs(np.linalg.norm(rPA) - np.linalg.norm(rQA)) < 1
        or abs(np.linalg.norm(vP) - np.linalg.norm(vQ)) < 1
        or np.linalg.norm(P - Q) < 2
        or np.linalg.norm(PPV - Q) < 1
        or np.linalg.norm(QPV - P) < 1
        or np.linalg.norm(PPV - QPV) < 1
    ):
        rPA = randIntNonZeroArray(2, -3, 3)
        rQA = randIntNonZeroArray(2, -3, 3)
        vP = randIntNonZeroArray(2, -3, 3)
        vQ = randIntNonZeroArray(2, -3, 3)
        P = np.zeros(3)
        A = P + rPA
        Q = A - rQA
        PPV = P + vP
        QPV = Q + vQ

        [bottomLeft, bottomRight, topLeft, topRight, center, extent] = boundingBox2D(
            [P, A, Q, PPV, QPV]
        )
        maxExtent = max(extent[0], extent[1])

    omegaPA = np.array([0, 0, np.dot(vP - vQ, rQA) / np.dot(perp(rQA), rPA)])
    vA = vP + np.cross(omegaPA, rPA)
    C = center

    Px = 200 + 30 * (P[0] - C[0])
    Py = 200 - 30 * (P[1] - C[1])

    Ax = 200 + 30 * (A[0] - C[0])
    Ay = 200 - 30 * (A[1] - C[1])

    Qx = 200 + 30 * (Q[0] - C[0])
    Qy = 200 - 30 * (Q[1] - C[1])

    data["params"]["Px"] = Px
    data["params"]["Py"] = Py
    data["params"]["Ax"] = Ax
    data["params"]["Ay"] = Ay
    data["params"]["Qx"] = Qx
    data["params"]["Qy"] = Qy

    vPangle = np.arctan2(vP[1], vP[0]) * 180 / np.pi
    vQangle = np.arctan2(vQ[1], vQ[0]) * 180 / np.pi

    if vPangle < 0:
        vPangle = abs(vPangle)
    else:
        vPangle = -vPangle

    if vQangle < 0:
        vQangle = abs(vQangle)
    else:
        vQangle = -vQangle

    data["params"]["rPA_vec"] = cartesianVector(rPA)
    data["params"]["rQA_vec"] = cartesianVector(rQA)
    data["params"]["vP_vec"] = cartesianVector(vP)
    data["params"]["vQ_vec"] = cartesianVector(vQ)

    data["params"]["rPA"] = pl.to_json(rPA)
    data["params"]["rQA"] = pl.to_json(rQA)
    data["params"]["vP"] = pl.to_json(vP)
    data["params"]["vQ"] = pl.to_json(vQ)

    data["params"]["vQangle"] = vQangle
    data["params"]["vPangle"] = vPangle
    data["params"]["vQwidth"] = 25 * np.linalg.norm(vQ)
    data["params"]["vPwidth"] = 25 * np.linalg.norm(vP)

    data["correct_answers"]["vAx"] = float(vA[0])
    data["correct_answers"]["vAy"] = float(vA[1])

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


def perp(v):
    """v: numpy array of size (n,)
       n: size of the array
    returns the counterclockwise orthogonal vector to v
    """
    return np.array([-v[1], v[0], 0])


def cross2DOut(v1, v2):
    return v1[0] * v2[1] - v1[1] * v2[0]
