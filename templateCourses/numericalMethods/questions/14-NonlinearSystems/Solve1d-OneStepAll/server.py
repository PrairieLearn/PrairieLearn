import random

import numpy as np


def generate(data):
    x0, x1 = random.sample([-2, -1, 1, 2], 2)
    c = float(random.randint(3, 6))
    pos = [-4, -2, -1]
    a = random.choice(pos)
    pos.remove(a)
    b = -1 * random.choice(pos)
    original_a, original_b = a, b

    def f(x):
        return np.sin(x / c)

    def df(x):
        return (1.0 / c) * np.cos(x / c)

    der = (f(x1) - f(x0)) / float(x1 - x0)
    secant_iterate = float(x1) - f(x1) / der
    newton_iterate = float(x1) - f(x1) / df(x1)

    # keep same sign, n is number of iterations
    n = random.randint(2, 3)
    for _ in range(n):
        m = (a + b) / 2
        if f(m) * f(a) > 0:
            a = m
        else:
            b = m

    data["params"]["n"] = n
    data["params"]["coeff"] = c
    data["params"]["x0"] = x0
    data["params"]["x1"] = x1
    data["params"]["a"] = original_a
    data["params"]["b"] = original_b

    data["correct_answers"]["x2secant"] = secant_iterate
    data["correct_answers"]["x2newton"] = newton_iterate
    data["correct_answers"]["ap"] = a
    data["correct_answers"]["bp"] = b

    return data
