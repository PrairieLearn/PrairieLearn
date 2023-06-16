import random

import numpy as np


def generate(data):

    a = random.randint(70, 99)
    b = random.randint(70, 99)
    c = random.randint(70, 99)

    d = random.randint(-9, -2)
    e = random.randint(2, 9)
    f = random.randint(2, 9)
    g = random.randint(-3, -1)

    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c

    data["params"]["d"] = d
    data["params"]["e"] = e
    data["params"]["f"] = f
    data["params"]["g"] = g

    result = list(np.ones((a, b, c))[:d, e:, f:g].shape)
    data["correct_answers"]["shape0"] = result[0]
    data["correct_answers"]["shape1"] = result[1]
    data["correct_answers"]["shape2"] = result[2]
    return data
