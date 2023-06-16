import numpy as np


def generate(data):
    c = np.random.randint(1, 10)
    p = np.random.randint(1, 3)
    step = np.random.randint(1, 10) / 100
    point = np.random.randint(1, 10) / 10

    f = lambda x: c * np.exp(p * x)

    anal_deriv = p * f(point)
    num_deriv = (f(point + step) - f(point)) / step
    err = np.abs((anal_deriv - num_deriv) / anal_deriv)

    data["params"]["c"] = c
    data["params"]["p"] = p
    data["params"]["step"] = step
    data["params"]["point"] = point
    data["correct_answers"]["t1"] = err
    return data
