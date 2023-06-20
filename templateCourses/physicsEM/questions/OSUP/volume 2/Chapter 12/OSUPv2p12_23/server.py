import random

import numpy as np


def generate(data):

    # define bounds of the variables
    B = random.choice(np.linspace(1, 9, num=41))  # uT
    d = random.choice(np.linspace(10, 80, num=36))  # cm

    # store the variables in the dictionary "params"
    data["params"]["B"] = "{:.1f}".format(B)
    data["params"]["d"] = "{:.0f}".format(d)

    # fix units
    B = B * 1e-6  # T
    d = d / 100  # m

    # define some constants
    u0 = 4e-7 * np.pi

    # calculate the correct
    I = B * 2 * np.pi * d / u0

    # define correct answers
    data["correct_answers"]["part1_ans"] = I
