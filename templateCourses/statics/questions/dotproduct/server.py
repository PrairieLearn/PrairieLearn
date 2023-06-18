import random

import numpy as np


def generate(data):

    a = random.randint(-10, 10)
    b = random.randint(-10, 10)
    c = random.randint(5, 10)

    a1 = random.randint(5, 10)
    b1 = random.randint(-10, 10)
    c1 = random.randint(-10, 10)

    A = [a, b, c]
    B = [a1, b1, c1]

    ans = int(np.dot(A, B))

    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c
    data["params"]["a1"] = a1
    data["params"]["b1"] = b1
    data["params"]["c1"] = c1

    data["correct_answers"]["ans"] = ans

    return data
