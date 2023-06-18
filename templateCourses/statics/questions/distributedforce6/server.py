import random


def generate(data):

    L = random.randint(10, 20)
    W0 = random.randint(10, 50)
    W1 = W0 * 1.5

    fx = 0
    fy = -5 * W0 * L / 12
    fz = 0

    mx = 0
    my = 0
    mz = 5 * W0 * (L**2) / 108

    data["params"]["L"] = L
    data["params"]["W0"] = W0
    data["params"]["W1"] = W1

    data["correct_answers"]["fx"] = fx
    data["correct_answers"]["fy"] = fy
    data["correct_answers"]["mz"] = mz

    return data
