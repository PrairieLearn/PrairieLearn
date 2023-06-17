import random

import numpy as np
import prairielearn as pl
from pl_geom import *
from pl_random import *
from pl_template import *


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
