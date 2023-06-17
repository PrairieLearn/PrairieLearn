import random

import numpy as np
import prairielearn as pl
from pl_draw import *
from pl_geom import *
from pl_random import *
from pl_template import *


def generate(data):
    rLen = random.randint(2, 4)
    vLen = random.randint(2, 4)
    rAng = random.uniform(0, 2 * np.pi)
    thetaDotSign = random.choice(["zero", "positive", "negative"])

    if thetaDotSign == "zero":
        vAng = rAng + random.choice([0, np.pi])
    elif thetaDotSign == "positive":
        vAng = rAng + random.uniform(1 / 6 * np.pi, 5 / 6 * np.pi)
    elif thetaDotSign == "negative":
        vAng = rAng - random.uniform(1 / 6 * np.pi, 5 / 6 * np.pi)

    r = polarToRect(np.array([rLen, rAng]))
    v = polarToRect(np.array([vLen, vAng]))

    rSide = randSign()
    rCent = np.array([rSide * 2.25, random.choice([-0.5, 0, 0.5]), 0])
    vCent = np.array([-rSide * 2.25, random.choice([-0.5, 0, 0.5]), 0])
    rPos = rCent - 0.5 * r
    vPos = vCent - 0.5 * v

    bool1 = False
    bool2 = False
    bool3 = False

    if thetaDotSign == "zero":
        bool2 = True
    elif thetaDotSign == "positive":
        bool3 = True
    elif thetaDotSign == "negative":
        bool1 = True

    data["params"]["bool1"] = bool1
    data["params"]["bool2"] = bool2
    data["params"]["bool3"] = bool3

    # pl-drawing
    scalar = 30
    rx = 150 + scalar * rPos[0]
    ry = 185 / 2 - scalar * rPos[1]

    vx = 150 + scalar * vPos[0]
    vy = 185 / 2 - scalar * vPos[1]

    [rAngle, rPLAngle] = angleOf(r)
    [vAngle, vPLAngle] = angleOf(v)

    data["params"]["rx"] = rx
    data["params"]["ry"] = ry
    data["params"]["vx"] = vx
    data["params"]["vy"] = vy
    data["params"]["rAngle"] = rPLAngle
    data["params"]["vAngle"] = vPLAngle
    data["params"]["rWidth"] = scalar * np.linalg.norm(r)
    data["params"]["vWidth"] = scalar * np.linalg.norm(v)

    return data
