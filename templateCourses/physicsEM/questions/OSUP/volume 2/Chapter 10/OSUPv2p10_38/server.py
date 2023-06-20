import random

import numpy as np


def generate(data):

    # Sample random numbers
    R1 = random.choice(np.linspace(10, 15, num=6))  # Ohm
    R2 = random.choice(np.linspace(3, 9, num=7))  # Ohm
    R3 = random.choice(np.linspace(3, 9, num=7))  # Ohm
    I1 = random.choice(np.linspace(1, 3, num=3))  # A
    V2 = random.choice(np.linspace(20, 25, num=6))  # V

    # store the variables in the dictionary "params"
    data["params"]["R1"] = "{:.1f}".format(R1)
    data["params"]["R2"] = "{:.1f}".format(R2)
    data["params"]["R3"] = "{:.1f}".format(R3)
    data["params"]["I1"] = "{:.1f}".format(I1)
    data["params"]["V2"] = "{:.1f}".format(V2)

    # Compute the solutions
    V1 = (I1 * R1 * R2 + I1 * R1 * R3 + I1 * R2 * R3 - R2 * V2) / (R2 + R3)
    I2 = -(I1 * R3 - V2) / (R2 + R3)
    I3 = (I1 * R2 + V2) / (R2 + R3)

    # Put the solutions into data['correct_answers']
    data["correct_answers"]["part1_ans"] = V1
    data["correct_answers"]["part2_ans"] = I2
    data["correct_answers"]["part3_ans"] = I3
