import numpy as np


def generate(data):

    dim = np.random.randint(3, 16) * 10

    data["params"]["a"] = dim
    data["params"]["b"] = dim**2
    data["correct_answers"]["f"] = np.floor((dim**2 - (dim + 1)) / 2)
