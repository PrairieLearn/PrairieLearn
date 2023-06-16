import numpy as np


def generate(data):
    coe = np.random.randint(2, 5)
    e1 = np.random.randint(-5, 5)
    while e1 == coe or e1 == 0:
        e1 = np.random.randint(-5, 5)
    e2 = np.random.randint(-5, 5)
    while e1 == e2 or e2 == 0 or e2 == coe:
        e2 = np.random.randint(-5, 5)

    if abs(e1) < abs(e2):
        temp = e1
        e1 = e2
        e2 = temp

    data["params"]["coe"] = coe
    data["params"]["e1"] = e1
    data["params"]["e2"] = e2

    sol1 = (1 / (e1 - coe)) ** 2
    sol2 = (1 / (e2 - coe)) ** 2
    if abs(sol1) > abs(sol2):
        data["correct_answers"]["eigenvalue1"] = sol1
        data["correct_answers"]["eigenvalue2"] = sol2
    else:
        data["correct_answers"]["eigenvalue1"] = sol2
        data["correct_answers"]["eigenvalue2"] = sol1
