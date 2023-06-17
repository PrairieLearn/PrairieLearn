import random

import numpy as np
import prairielearn as pl
from pl_geom import *
from pl_random import *
from pl_template import *
from sympy import *


def generate(data):
    QPos = random.choice(["left", "top", "right"])
    r = random.randint(2, 9)
    s = random.choice([-1, 1])
    omega = s * random.randint(2, 9)

    if QPos == "left":
        vQ = np.array([1, 1, 0]) * (-s * random.randint(2, 9))
        rCQHat = np.array([-1, 0, 0])
        Qx = 200
        Qy = 150
    elif QPos == "top":
        vQ = np.array([-s * random.randint(2, 9), 0, 0])
        rCQHat = np.array([0, 1, 0])
        Qx = 300
        Qy = 50
    else:
        vQ = np.array([1, -1, 0]) * (-s * random.randint(2, 9))
        rCQHat = np.array([1, 0, 0])
        Qx = 400
        Qy = 150

    defs = NChoice(2, ["r", "omega"])
    givenDef = defs[0]
    ansDef = defs[1]

    if ansDef == "r":
        ansVar = "r"
        ansDescription = "radius"
        ansUnits = "\\rm\\ m"
        givenVar = "omega"
        data["params"]["givenVar"] = givenVar
        data["params"][givenVar] = pl.to_json(np.array([0, 0, omega]))
        givenExp = (
            "angular velocity $\\vec\\omega = "
            + cartesianVector(np.array([0, 0, omega]))
            + "\\rm\\ rad/s$"
        )
    else:
        ansVar = "\\vec\\omega"
        ansDescription = "angular velocity"
        ansUnits = "\\hat{k}{\\rm\\ rad/s}"
        givenVar = "r"
        data["params"]["givenVar"] = givenVar
        data["params"][givenVar] = r
        givenExp = "radius $r = " + f"{r}" + "\\rm\\ m$"

    vQDir = perp(rCQHat) + np.array([-1, 0, 0])

    if ansDef == "r":
        ansValue = np.dot(vQ, vQDir) / omega / np.dot(vQDir, vQDir)
    else:
        ansValue = np.dot(vQ, vQDir) / r / np.dot(vQDir, vQDir)

    data["params"]["vQ_vec"] = cartesianVector(vQ)
    data["params"]["vQ"] = pl.to_json(vQ)
    data["params"]["QPos"] = QPos
    data["params"]["givenExp"] = givenExp
    data["params"]["ansVar"] = ansVar
    data["params"]["ansDescription"] = ansDescription
    data["params"]["ansUnits"] = ansUnits
    data["params"]["Qx"] = float(Qx)
    data["params"]["Qy"] = float(Qy)

    data["correct_answers"]["ansValue"] = ansValue

    return data
