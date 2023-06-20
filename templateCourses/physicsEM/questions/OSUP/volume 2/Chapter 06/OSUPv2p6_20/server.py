import random

import numpy as np


def generate(data):

    # Sample random numbers
    E = random.choice(np.linspace(0.5, 8.5, num=81))
    p = random.choice([2, 3, 4, 5, 6])
    d = random.choice(np.linspace(0.5, 4, num=36))

    # Put these numbers into data['params']
    data["params"]["E"] = "{:.1f}".format(E)
    data["params"]["p"] = "{:.0f}".format(p)
    data["params"]["d"] = "{:.1f}".format(d)

    # Compute the solution
    phi = E * 10**p * d**2  # N m^2/C

    # Put the solution into data['correct_answers']
    data["correct_answers"]["phi"] = round_sig(phi, 3)


def round_sig(x, sig):
    from math import floor, log10

    if x == 0:
        y = 0
    else:
        y = sig - int(floor(log10(abs(x)))) - 1
    return round(x, y)
