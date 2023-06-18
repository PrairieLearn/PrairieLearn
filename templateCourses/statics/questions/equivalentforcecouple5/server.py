import math
import random

import numpy as np


def generate(data):

    # Randomize car geometry

    alpha = random.randint(20, 40)
    a = random.randint(5, 10)
    b = 0.3 * a
    c = 0.5 * a
    d = b * 1.3
    e = 0.4 * a

    f1 = random.randint(10, 15)
    f2 = f1 * 0.8

    alpharad = alpha / 180 * math.pi

    Fx = (f1 * (3 / 5)) - (f2 * (math.cos(alpharad)))
    Fy = (f1 * (4 / 5)) - (f2 * (math.sin(alpharad)))
    Fz = 0

    r1 = [-e, (a + d), 0]
    fr1 = [(3 * f1 / 5), (4 * f1 / 5), 0]
    mf1 = np.cross(r1, fr1)

    r2 = [-(e + c), (d - b), 0]
    fr2 = [-(f2 * math.cos(alpharad)), -(f2 * math.sin(alpharad)), 0]
    mf2 = np.cross(r2, fr2)

    m = mf1 + mf2

    mx = m[0]
    my = m[1]
    mz = m[2]

    data["params"]["alpha"] = alpha
    data["params"]["e"] = e
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c
    data["params"]["d"] = d
    data["params"]["f1"] = f1
    data["params"]["f2"] = f2

    data["correct_answers"]["Fx"] = Fx
    data["correct_answers"]["Fy"] = Fy
    data["correct_answers"]["Fz"] = Fz
    data["correct_answers"]["mx"] = mx
    data["correct_answers"]["my"] = my
    data["correct_answers"]["mz"] = mz

    return data
