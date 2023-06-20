import random

import numpy as np


def generate(data):

    # Sample a random number
    q = random.choice([-10, -9, -8, -7, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    p = random.choice([-12])
    rin = random.choice([2, 2.2, 2.4, 2.6, 2.8, 3, 3.2, 3.4, 3.6, 3.8, 4])
    dr = random.choice([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1])
    E = random.choice([4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10])
    rout = rin + dr

    # Put this numbers into data['params']
    data["params"]["q"] = "{:.1f}".format(q)
    data["params"]["p"] = "{:.0f}".format(p)
    data["params"]["rin"] = "{:.1f}".format(rin)
    data["params"]["rout"] = "{:.1f}".format(rout)
    data["params"]["E"] = "{:.1f}".format(E)

    # Compute the solution
    e0 = 8.85e-12
    sigInner = -q * 10**p / (4 * np.pi * (rin / 100) ** 2)
    sigOuter = e0 * E
    Q = sigOuter * 4 * np.pi * (rout / 100) ** 2 - q * 10**p

    # Put the solutions into data['correct_answers']
    data["correct_answers"]["sigInner"] = round_sig(sigInner, 3)
    data["correct_answers"]["sigOuter"] = round_sig(sigOuter, 3)
    data["correct_answers"]["Q"] = round_sig(Q, 3)


def round_sig(x, sig):
    from math import floor, log10

    if x == 0:
        y = 0
    else:
        y = sig - int(floor(log10(abs(x)))) - 1
    return round(x, y)
