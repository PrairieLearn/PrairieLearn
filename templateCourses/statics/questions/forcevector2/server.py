import random

import numpy as np


def generate(data):

    fb = random.randint(300, 400)
    fc = random.randint(300, 400)
    a = random.randint(2, 7)
    b = random.randint(3, 8)
    c = random.randint(2, 7)
    d = random.randint(3, 8)
    e = random.randint(4, 9)

    avec = np.array([c, -d, -e])
    bvec = np.array([a, b, -e])
    amag = ((avec[0] ** 2) + (avec[1] ** 2) + (avec[2] ** 2)) ** 0.5
    bmag = ((bvec[0] ** 2) + (bvec[1] ** 2) + (bvec[2] ** 2)) ** 0.5

    fvec = ((fb / amag) * avec) + ((fc / bmag) * bvec)

    fvecd = fvec.astype(float)

    data["params"]["fb"] = fb
    data["params"]["fc"] = fc
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c
    data["params"]["d"] = d
    data["params"]["e"] = e

    data["correct_answers"]["f1"] = fvecd[0]
    data["correct_answers"]["f2"] = fvecd[1]
    data["correct_answers"]["f3"] = fvecd[2]

    return data
