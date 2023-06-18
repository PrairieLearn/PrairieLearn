import math
import random

import numpy as np


def generate(data):

    alpha = random.randint(20, 75)
    Fj = random.randint(600, 900)
    Fk = random.randint(600, 900)
    a = random.randint(2, 6)
    b = random.randint(5, 10)
    alpharad = math.radians(alpha)

    fx = -Fj * (math.cos(alpharad))
    fy = (-Fj * (math.sin(alpharad))) + Fk
    fz = 0

    rj = np.array([-a, b, 0])
    fj = np.array([(Fj * (math.cos(alpharad))), (Fj * (math.sin(alpharad))), 0])
    mfj = np.cross(rj, fj)

    mfk = np.array([0, 0, (Fk * a)])

    moment1 = mfj + mfk
    moment = -1 * moment1
    m1 = moment[0]
    m2 = moment[1]
    m3 = moment[2]

    data["params"]["alpha"] = alpha
    data["params"]["Fj"] = Fj
    data["params"]["Fk"] = Fk
    data["params"]["a"] = a
    data["params"]["b"] = b

    data["correct_answers"]["fx"] = fx
    data["correct_answers"]["fy"] = fy
    data["correct_answers"]["fz"] = fz
    data["correct_answers"]["m1"] = m1
    data["correct_answers"]["m2"] = m2
    data["correct_answers"]["m3"] = m3

    return data
