import random

import numpy as np


def generate(data):

    # Sample a random number
    sign1 = random.choice([-1, 1])
    q1 = sign1 * random.choice(np.linspace(1.5, 5.5, num=5))
    sign2 = random.choice([-1, 1])
    q2 = sign2 * random.choice(np.linspace(1, 5, num=5))

    # Put this number into data['params']
    data["params"]["q1"] = "{:.1f}".format(q1)
    data["params"]["q2"] = "{:.1f}".format(q2)

    # Compute the solution
    x1 = 1  # m

    if sign1 == sign2:  # The charges are the same sign
        x2 = -np.sqrt(q2 / q1) * x1
    else:  # The charges are opposite sign
        x2 = np.sqrt(-q2 / q1) * x1

    # Put the solution into data['correct_answers']
    data["correct_answers"]["x2"] = round_sig(x2, 3)


def round_sig(x, sig):
    from math import floor, log10

    if x == 0:
        y = 0
    else:
        y = sig - int(floor(log10(abs(x)))) - 1
    return round(x, y)
