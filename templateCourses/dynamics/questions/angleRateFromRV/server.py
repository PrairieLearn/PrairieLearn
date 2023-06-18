import random

import numpy as np


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


def polarToRect(polar_vec):
    x = polar_vec[0] * np.cos(polar_vec[1])
    y = polar_vec[0] * np.sin(polar_vec[1])

    return np.array([x, y, 0])


def randSign():
    return random.choice([-1, 1])


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
