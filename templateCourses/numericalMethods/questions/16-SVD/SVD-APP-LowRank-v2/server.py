import numpy as np
import prairielearn as pl


def generate(data):
    a = np.random.randint(-10, 10)
    b = np.random.randint(-10, 10)
    c = np.random.randint(-10, 10)
    d = np.random.randint(-10, 10)
    e = np.random.randint(-10, 10)
    M = np.random.randint(2, 10)
    A = np.array([[a, M * a], [b, M * b], [c, M * c], [d, M * d], [e, e * M]])
    data["params"]["A"] = pl.to_json(A)
    data["correct_answers"]["f"] = 0
    return data
