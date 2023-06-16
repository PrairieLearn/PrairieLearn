import random

import numpy as np
import prairielearn as pl


def generate(data):

    a = np.random.randint(1, 10) + np.random.randint(1, 10) / 10
    b = np.random.randint(1, 10) + np.random.randint(1, 10) / 10
    c = np.random.randint(1, 10) + np.random.randint(1, 10) / 10

    if random.choice([0, 1]):
        v = np.array([0, 1]).reshape((2, 1))
        A = np.array([[a, 0], [b, c]])
        f = c
    else:
        v = np.array([1, 0]).reshape((2, 1))
        A = np.array([[a, b], [0, c]])
        f = a

    data["params"]["A"] = pl.to_json(A)
    data["params"]["v"] = pl.to_json(v)
    data["correct_answers"]["f"] = f
    return data
