import random

import numpy as np


def generate(data):

    # Sample random numbers
    q = random.choice(np.linspace(-50, -10, num=9))
    r = random.choice(np.linspace(8, 12, num=41))
    r1 = random.choice(np.linspace(4, 7, num=31))
    r2 = random.choice(np.linspace(14, 18, num=41))

    # Put these numbers into data['params']
    data["params"]["q"] = "{:.1f}".format(q)
    data["params"]["r"] = "{:.1f}".format(r)
    data["params"]["r1"] = "{:.1f}".format(r1)
    data["params"]["r2"] = "{:.1f}".format(r2)

    # Compute the solutions
    e0 = 8.85e-12  # C^2/N m^2
    E1 = q * 10**-6 * (r1 / r) ** 3 / (4 * np.pi * e0 * (r1 / 100) ** 2)
    E2 = q * 10**-6 / (4 * np.pi * e0 * (r2 / 100) ** 2)

    # Put the solutions into data['correct_answers']
    data["correct_answers"]["E1"] = E1
    data["correct_answers"]["E2"] = E2
