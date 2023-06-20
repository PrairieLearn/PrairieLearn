import random

import numpy as np


def generate(data):

    # define bounds of the variables
    N = random.choice(np.linspace(20, 70, num=6))  # coils
    d = random.choice(np.linspace(5, 25, num=5))  # cm
    B = random.choice(np.linspace(0.25, 1, num=4))  # T
    t = random.choice(np.linspace(0.1, 1, num=10))  # s

    # store the variables in the dictionary "params"
    data["params"]["N"] = "{:.0f}".format(N)
    data["params"]["d"] = "{:.0f}".format(d)
    data["params"]["B"] = "{:.2f}".format(B)
    data["params"]["t"] = "{:.1f}".format(t)

    # fix units
    d = d * 1e-2  # m

    # calculate the correct answer
    A = (np.pi * d**2) / 4  # m^2
    E = (N * B * A) / t  # V

    # define correct answers
    data["correct_answers"]["part1_ans"] = E
