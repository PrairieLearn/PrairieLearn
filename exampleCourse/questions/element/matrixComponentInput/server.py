import numpy as np
import prairielearn as pl


def generate(data):
    N = 2
    A = np.random.rand(N, N)
    sf = 2
    B = np.round(A, sf)
    x = np.array([[1, 2, 3, 4]])
    long_matrix = np.arange(1, 21).reshape((1, 20))
    y = (2.0 ** -np.arange(1, 5)).reshape((1, 4))
    I = np.array([[1, 0, 0], [0, 1, 0], [0, 0, 1]])

    data["params"]["sf"] = sf
    data["params"]["in"] = pl.to_json(B)
    data["params"]["x"] = pl.to_json(x)

    data["correct_answers"]["out1"] = pl.to_json(B)
    data["correct_answers"]["out2"] = pl.to_json(B)
    data["correct_answers"]["out3"] = pl.to_json(x)
    data["correct_answers"]["out4"] = pl.to_json(long_matrix)
    data["correct_answers"]["out5"] = pl.to_json(y)
    data["correct_answers"]["out6"] = pl.to_json(I)

    return data
