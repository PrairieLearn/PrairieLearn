import random

import numpy as np


def generate(data):

    # Sample random numbers
    point = random.choice(["$P_1$", "$P_2$", "$P_3$", "$P_4$"])

    # Put these numbers into data['params']
    data["params"]["point"] = point

    # Compute the solution
    q1 = 5e-3  # C
    q2 = -10e-3  # C
    if point == "$P_1$":
        d1 = 0.02  # m
        d2 = 0.06  # m
    elif point == "$P_2$":
        d1 = 0.06  # m
        d2 = 0.02  # m
    else:
        d1 = np.sqrt(0.04**2 + 0.03**2)  # m
        d2 = d1

    e0 = 8.85e-12
    V = q1 / (4 * np.pi * e0 * d1) + q2 / (4 * np.pi * e0 * d2)

    # Put the solution into data['correct_answers']
    data["correct_answers"]["V"] = V  # ext.round_sig(V, 3)
