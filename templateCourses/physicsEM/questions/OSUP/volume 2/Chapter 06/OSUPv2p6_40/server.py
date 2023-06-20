import random

import numpy as np


def generate(data):

    # Sample random numbers
    q = random.choice(np.linspace(1, 20, num=39))
    p = random.choice([-8, -7, -6, -5])
    d = random.choice(np.linspace(6, 9, num=31))
    d1 = random.choice(np.linspace(10, 12, num=21))
    r = random.choice(np.linspace(2, 5, num=31))

    # Put these numbers into data['params']
    data["params"]["q"] = "{:.1f}".format(q)
    data["params"]["p"] = "{:.0f}".format(p)
    data["params"]["d"] = "{:.1f}".format(d)
    data["params"]["d1"] = "{:.1f}".format(d1)
    data["params"]["r"] = "{:.1f}".format(r)

    # Compute the solutions
    e0 = 8.85e-12  # C^2/N m^2
    rho = q * 10**p / (d / 100) ** 3
    Phi1 = q * 10**p / e0
    Phi2 = (rho * 4 * np.pi * (r / 100) ** 3 / 3) / e0

    # Put the solutions into data['correct_answers']
    data["correct_answers"]["rho"] = round_sig(rho, 3)
    data["correct_answers"]["Phi1"] = round_sig(Phi1, 3)
    data["correct_answers"]["Phi2"] = round_sig(Phi2, 3)


def round_sig(x, sig):
    from math import floor, log10

    if x == 0:
        y = 0
    else:
        y = sig - int(floor(log10(abs(x)))) - 1
    return round(x, y)
