import random
from collections import defaultdict

import numpy as np

nested_dict = lambda: defaultdict(nested_dict)


def generate(data):
    data2 = nested_dict()

    # define bounds of the variables
    c = random.choice(np.linspace(100, 200, num=21))  # microF
    v = random.choice(np.linspace(100, 200, num=21))  # V

    # store the variables in the dictionary "params"
    data2["params"]["c"] = "{:.0f}".format(c)
    data2["params"]["v"] = "{:.0f}".format(v)

    # fix units
    c = c * 1e-6  # F

    # calculate the correct
    Q = c * v  # C

    # define correct answers
    data2["correct_answers"]["part1_ans"] = Q

    # Update the data object with a new dict
    data.update(data2)
