import random

import numpy as np


def generate(data):
    a = np.round(random.uniform(1, 10), 1)
    data["params"]["a"] = a
    data["correct_answers"]["area"] = a**2

    b = np.round(random.uniform(1, 10), 3)
    data["params"]["b"] = b
    data["correct_answers"]["b2"] = 2 * b
