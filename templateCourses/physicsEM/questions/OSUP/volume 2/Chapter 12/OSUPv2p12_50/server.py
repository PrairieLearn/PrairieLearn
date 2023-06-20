import random

import numpy as np


def generate(data):

    # define bounds of the variables
    n = random.choice(np.linspace(8, 20, num=13))  # turns/cm
    B = random.choice(np.linspace(1, 5, num=21))
    p = random.choice(np.linspace(-2, -1, num=2))

    # store the variables in the dictionary "params"
    data["params"]["n"] = "{:.0f}".format(n)
    data["params"]["B"] = "{:.1f}".format(B) + "\\times 10^{" + "{:.0f}".format(p) + "}"

    # fix units
    n = n * 100  # turns/m
    B = B * 10**p  # T

    # define some constants
    u0 = 4e-7 * np.pi

    # calculate the solution
    I = B / (u0 * n)

    # define correct answers
    data["correct_answers"]["part1_ans"] = I
