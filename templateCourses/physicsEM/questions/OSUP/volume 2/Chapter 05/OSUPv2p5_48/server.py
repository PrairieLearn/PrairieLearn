import random

import numpy as np


def generate(data):

    # Sample a random number
    sign1 = random.choice([-1, 1])
    q1 = sign1 * random.choice(np.linspace(1, 9, num=41))
    sign2 = random.choice([-1, 1])
    q2 = sign2 * random.choice(np.linspace(1, 9, num=41))
    F = random.choice(np.linspace(1, 9, num=17))

    # Put the values into data['params']
    data["params"]["q1"] = "{:.1f}".format(q1)
    data["params"]["q2"] = "{:.1f}".format(q2)
    data["params"]["F"] = "{:.1f}".format(F)

    # Compute the solution
    e0 = 8.85e-12
    k = 1 / (4 * np.pi * e0)
    d = np.sqrt(np.abs(k * q1 * q2 * 1e-12) / F)  # m

    # Put the solution into data['correct_answers']
    data["correct_answers"]["d"] = d
