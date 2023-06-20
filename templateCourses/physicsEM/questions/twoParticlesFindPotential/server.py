import random

import numpy as np


def generate(data):

    pA = [200, 150]
    # distance from each particle to the center
    d = random.choice([6, 7])
    dplot = d * 20

    pP = [pA[0] - dplot, pA[1]]
    pM = [pA[0] + dplot, pA[1]]
    data["params"]["pA"] = pA
    data["params"]["pP"] = pP
    data["params"]["pM"] = pM
    data["params"]["d"] = str(d) + " cm"

    # point to find the potential
    p_pos = random.choice([0, 1])  # 0: point in x-axis; 1: point in y-axis
    p_sign = random.choice([-1, 1])

    offset = 0
    if p_pos == 0:
        dP = random.choice([2, 3, 4])
        p = [pA[0] + p_sign * dP * 20, pA[1]]
        d1 = d + p_sign * dP
        d2 = d - p_sign * dP
    else:
        dP = random.choice([4, 5])
        p = [pA[0], pA[1] + p_sign * dP * 20]
        if p_sign == 1:
            offset = -10
        else:
            offset = 15
        d1 = np.sqrt(d**2 + dP**2)
        d2 = d1

    data["params"]["dP"] = str(dP) + " cm"
    data["params"]["p"] = p
    data["params"]["offset"] = offset

    # # Compute the solution
    q1 = random.randint(2, 6)
    data["params"]["q1"] = f"{q1}\\\mu F"
    q1 = q1 * 1e-3  # C

    q2 = -random.randint(7, 14)
    data["params"]["q2"] = f"{q2}\\\mu F"
    q2 = q2 * 1e-3  # C

    e0 = 8.85e-12
    V = q1 / (4 * np.pi * e0 * d1) + q2 / (4 * np.pi * e0 * d2)
    data["correct_answers"]["V"] = V
