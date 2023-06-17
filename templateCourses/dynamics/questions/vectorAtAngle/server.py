import random

import numpy as np
import prairielearn as pl
from pl_geom import *
from pl_random import *
from pl_template import *


def generate(data):
    a = randIntNonZeroArray(2, -4, 4)
    while (
        (abs(abs(a[0]) - abs(a[1]))) < 1e-6
        or abs(a[0]) < 1e-6
        or abs(a[1]) < 1e-6
        or np.linalg.norm(a) < 1.5
    ):
        a = randIntNonZeroArray(2, -4, 4)

    thetaCoeff = [random.randint(2, 7), 9]
    thetaSign = random.choice([-1, 1])
    bLength = random.randint(2, 4)

    theta = thetaSign * thetaCoeff[0] / thetaCoeff[1] * np.pi
    [aAngle, aPLangle] = angleOf(a)
    bAngle = aAngle + theta
    b = vector2DAtAngle(bAngle) * bLength

    data["params"]["a_vec"] = cartesianVector(a)
    data["params"]["a"] = pl.to_json(a)
    data["params"]["a_angle"] = aPLangle
    data["params"]["a_width"] = 30 * np.linalg.norm(a)
    data["params"]["bLength"] = bLength
    data["params"]["thetaCoeff1"] = thetaCoeff[0]
    data["params"]["thetaCoeff2"] = thetaCoeff[1]
    data["params"]["theta"] = thetaCoeff[0] / thetaCoeff[1] * np.pi

    [bAngle, bPLangle] = angleOf(b)

    data["params"]["b_angle"] = bPLangle
    data["params"]["b_width"] = 30 * bLength

    crossprod = np.cross(a, b)[2]
    if crossprod > 0:
        angleStart = bPLangle
        angleEnd = aPLangle
    else:
        angleStart = aPLangle
        angleEnd = bPLangle

    if angleEnd < angleStart:
        angleEnd -= 360

    data["params"]["angleStart"] = angleStart
    data["params"]["angleEnd"] = angleEnd

    O = np.zeros(3)

    [bottomLeft, bottomRight, topLeft, topRight, center, extent] = boundingBox2D(
        [O, a, b]
    )

    C = center

    Ox = 255 + 30 * (O[0] - C[0])
    Oy = 155 - 30 * (O[1] - C[1])

    O = np.array([Ox, Oy, 0])

    data["params"]["Ox"] = Ox
    data["params"]["Oy"] = Oy

    [sum_angle, sum_PL_angle] = angleOf(a + b / np.linalg.norm(b) * np.linalg.norm(a))

    offsetx = 12 * np.cos(sum_angle)
    offsety = -12 * np.sin(sum_angle)

    data["params"]["offsetx"] = offsetx
    data["params"]["offsety"] = offsety

    data["correct_answers"]["bx"] = b[0]
    data["correct_answers"]["by"] = b[1]

    return data
