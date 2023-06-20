import random
from collections import defaultdict

import numpy as np

nested_dict = lambda: defaultdict(nested_dict)


def generate(data):
    data2 = nested_dict()

    # define bounds of the variables
    c = random.choice(np.linspace(1, 5, num=41))  # pF
    d = random.choice(np.linspace(1, 5, num=41))  # mm

    # store the variables in the dictionary "params"
    data2["params"]["c"] = "{:.1f}".format(c)
    data2["params"]["d"] = "{:.1f}".format(d)

    # fix units
    c = c * 1e-12  # F
    d = d * 1e-3  # m

    # define some constants
    eps0 = 8.85e-12

    # calculate the correct
    A = (c * d) / eps0  # m^2

    # define correct answers
    data2["correct_answers"]["part1_ans"] = A

    # Update the data object with a new dict
    data.update(data2)
