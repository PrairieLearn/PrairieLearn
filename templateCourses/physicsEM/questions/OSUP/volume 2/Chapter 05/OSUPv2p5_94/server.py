import random

import numpy as np


def generate(data):

    # Sample a random number
    L = random.choice(np.linspace(10, 13, num=7))
    E = random.choice(np.linspace(2, 6, num=9))
    p1 = random.choice([4, 5, 6])
    v = random.choice(np.linspace(0.8, 2, num=13))
    p2 = 7
    q = 1.6e-19  # C
    m = 1.67e-27  # mass of a proton in kg

    # Put this number into data['params']
    data["params"]["L"] = "{:.1f}".format(L)
    data["params"]["E"] = "{:.1f}".format(E)
    data["params"]["p1"] = "{:.0f}".format(p1)
    data["params"]["v"] = "{:.1f}".format(v)
    data["params"]["p2"] = "{:.0f}".format(p2)

    # Compute the solution
    d = round_sig(
        (q * E * 10**p1 / (2 * m) * (L * 1e-2 / (v * 10**p2)) ** 2) * 1e3, 3
    )  # mm

    # Put the solutions into data['correct_answers']
    data["correct_answers"]["d"] = d


def round_sig(x, sig):
    from math import floor, log10

    if x == 0:
        y = 0
    else:
        y = sig - int(floor(log10(abs(x)))) - 1
    return round(x, y)
