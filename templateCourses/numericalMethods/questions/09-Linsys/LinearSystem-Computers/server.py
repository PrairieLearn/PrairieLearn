import random

import numpy as np


def generate(data):

    x = np.random.randint(5, 20, 3)
    a = random.choice([1, 2])
    b = random.choice([2, 3])
    c = random.choice([1, 2])
    d = random.choice([1, 3])
    e = random.choice([3, 5])

    pcontains1 = np.array([a, 0, b])
    pcontains2 = np.array([c, d, 0])
    pcontains3 = np.array([0, 0, e])

    A = np.array([pcontains1, pcontains2, pcontains3]).T
    bv = np.dot(A, x)

    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c
    data["params"]["d"] = d
    data["params"]["e"] = e

    data["params"]["motherboards"] = int(bv[0])
    data["params"]["cpus"] = int(bv[1])
    data["params"]["cases"] = int(bv[2])

    data["correct_answers"]["p1"] = int(x[0])
    data["correct_answers"]["p2"] = int(x[1])
    data["correct_answers"]["p3"] = int(x[2])

    return data
