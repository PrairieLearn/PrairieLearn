import random

import numpy as np


def generate(data):

    # Sample a random number
    d = random.choice(np.linspace(0.2, 0.3, num=11))
    F1 = random.choice(np.linspace(0.3, 0.9, num=7))
    add = random.choice(np.linspace(0.1, 0.3, num=3))
    F2 = F1 + add

    # Put the values into data['params']
    data["params"]["d"] = "{:.2f}".format(d)
    data["params"]["F1"] = "{:.1f}".format(F1)
    data["params"]["F2"] = "{:.1f}".format(F2)

    # Compute the solution
    e0 = 8.85e-12
    k = 1 / (4 * np.pi * e0)
    Q = np.sqrt(F2 / k) * (2 * d)
    q1 = Q / 2 + np.sqrt((Q / 2) ** 2 - F1 * d**2 / k)
    q2 = Q / 2 - np.sqrt((Q / 2) ** 2 - F1 * d**2 / k)

    # Put the solutions into data['correct_answers']
    data["correct_answers"]["q1"] = round_sig(q1, 4)
    data["correct_answers"]["q2"] = round_sig(q2, 4)


def round_sig(x, sig):
    from math import floor, log10

    if x == 0:
        y = 0
    else:
        y = sig - int(floor(log10(abs(x)))) - 1
    return round(x, y)
