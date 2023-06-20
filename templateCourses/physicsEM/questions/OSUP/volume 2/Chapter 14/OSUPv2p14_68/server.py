import random
from ossaudiodev import control_labels

import numpy as np


def generate(data):

    # Sample random numbers
    L = random.choice(np.linspace(90, 110, num=21))  # mH
    c = random.choice(np.linspace(2, 5, num=13))  # micro F
    V = random.choice(np.linspace(10, 14, num=9))  # V

    # store the variables in the dictionary "params"
    data["params"]["L"] = f"{L} mH"
    data["params"]["C"] = f"{c}\\\mu F"
    data["params"]["V"] = f"{V} V"

    # Fixing units
    L = L / 1000  # H
    C = c / 10**6  # F

    # Compute the solutions
    omega = (L * C) ** (-1 / 2)
    f = omega / (2 * np.pi)
    Q = C * V
    I = omega * Q

    # Put the solutions into data['correct_answers']
    data["correct_answers"]["part1_ans"] = f
    data["correct_answers"]["part2_ans"] = Q
    data["correct_answers"]["part3_ans"] = I

    pA = [60, 60]
    h = 200

    points = {
        "pA": pA,
        "pB": [pA[0] + h, pA[1]],
        "pC": [pA[0], pA[1] + h / 2],
        "pD": [pA[0] + h, pA[1] + h / 2],
        "pE": [pA[0], pA[1] + h],
        "pF": [pA[0] + h, pA[1] + h],
    }

    data["params"]["pA"] = points["pA"]
    data["params"]["pB"] = points["pB"]
    data["params"]["pC"] = points["pC"]
    data["params"]["pD"] = points["pD"]
    data["params"]["pE"] = points["pE"]
    data["params"]["pF"] = points["pF"]
