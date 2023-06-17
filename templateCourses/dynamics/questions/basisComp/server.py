import random

import numpy as np
from pl_geom import *


def generate(data):
    theta = (random.randint(8, 14) * 5 + random.choice([0, 90])) * random.choice(
        [-1, 1]
    )

    thetaAbs = abs(theta)

    u = vector2DAtAngle(np.radians(theta))
    v = perp(u)

    [uAngle, uPLAngle] = angleOf(u)
    [vAngle, vPLAngle] = angleOf(v)

    data["params"]["u_theta"] = uPLAngle
    data["params"]["v_theta"] = vPLAngle
    data["params"]["thetaAbs"] = thetaAbs

    data["correct_answers"]["ux"] = float(u[0])
    data["correct_answers"]["uy"] = float(u[1])
    data["correct_answers"]["vx"] = float(v[0])
    data["correct_answers"]["vy"] = float(v[1])

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
