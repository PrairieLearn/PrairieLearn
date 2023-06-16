import numpy as np


def generate(data):
    coe = np.random.randint(3, 6)
    e1 = np.random.randint(-7, 7)
    while e1 == 0 or e1 == 1:
        e1 = np.random.randint(-7, 7)
    data["params"]["coe"] = coe
    data["params"]["e1"] = e1

    data["correct_answers"]["eigenvalue"] = 1 / (-e1 / coe + 1 / coe)
