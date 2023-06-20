import random

import numpy as np


def generate(data):

    # Sample random numbers
    V = random.choice(np.linspace(1, 6, num=51))
    p = random.choice(np.linspace(3, 6, num=4))
    d = random.choice(np.linspace(0.5, 3, num=26))

    # Put these numbers into data['params']
    data["params"]["V"] = "{:.2f}".format(V)
    data["params"]["p"] = "{:.0f}".format(p)
    data["params"]["d"] = "{:.2f}".format(d)

    # Compute the solution
    V = V * 10**p  # V
    d = d / 100  # m
    E = V / d  # N/C

    # Put the solution into data['correct_answers']
    data["correct_answers"]["E"] = E
