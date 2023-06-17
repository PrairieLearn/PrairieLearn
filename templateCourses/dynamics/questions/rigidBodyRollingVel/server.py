import random

import numpy as np
import prairielearn as pl
from pl_draw import *
from pl_random import *
from pl_template import *


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
