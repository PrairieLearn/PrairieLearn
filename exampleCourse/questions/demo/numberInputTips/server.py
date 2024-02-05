import random

import numpy as np


def generate(data):
    a = random.uniform(1, 10)
    around = np.round(a, 2)

    data["params"]["aexact"] = a
    data["params"]["a"] = around

    data["correct_answers"]["2aexact"] = 2 * a
    data["correct_answers"]["2a"] = 2 * around
