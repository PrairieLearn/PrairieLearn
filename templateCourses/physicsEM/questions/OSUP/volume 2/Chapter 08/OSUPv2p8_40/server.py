import random

import numpy as np


def generate(data):

    # define bounds of the variables
    c = random.choice(np.linspace(5, 15, num=11))  # microF
    v = random.choice(np.linspace(5, 15, num=11))  # V

    # store the variables in the dictionary "params"
    data["params"]["c"] = "{:.0f}".format(c)
    data["params"]["v"] = "{:.0f}".format(v)

    # calculate the correct
    U = 0.5 * v**2 * c  # microJ

    # define correct answers
    data["correct_answers"]["part1_ans"] = U
