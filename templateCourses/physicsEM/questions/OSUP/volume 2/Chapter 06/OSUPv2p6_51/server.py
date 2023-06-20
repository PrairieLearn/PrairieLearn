import random

import numpy as np


def generate(data):

    # Sample random numbers
    E = random.choice(np.linspace(1, 9, num=41))
    r = random.choice(np.linspace(0.4, 1.5, num=12))
    d = random.choice(np.linspace(2, 4, num=21))
    L = random.choice(np.linspace(5, 8, num=31))

    # Put these numbers into data['params']
    data["params"]["E"] = "{:.1f}".format(E)
    data["params"]["r"] = "{:.1f}".format(r)
    data["params"]["d"] = "{:.1f}".format(d)
    data["params"]["L"] = "{:.1f}".format(L)

    # Compute the solutions
    e0 = 8.85e-12  # C^2/N m^2
    lam = E * 2 * np.pi * e0 * d / 100
    Phi = (lam * L / 100) / e0

    # Put the solutions into data['correct_answers']
    data["correct_answers"]["lam"] = round_sig(lam, 3)
    data["correct_answers"]["Phi"] = round_sig(Phi, 3)


def round_sig(x, sig):
    from math import floor, log10

    if x == 0:
        y = 0
    else:
        y = sig - int(floor(log10(abs(x)))) - 1
    return round(x, y)
