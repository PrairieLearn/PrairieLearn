import math
import random


def generate(data):

    E1 = random.randint(65, 75)
    E2 = random.randint(195, 210)
    L = random.randint(700, 800)
    A = random.randint(1700, 1800)
    alpha1 = random.randint(20, 25)
    alpha2 = random.randint(12, 17)
    rod = random.randint(1, 2)
    delta = random.randint(4, 9)

    delta = delta / 10
    epsilon = 0

    f1 = L / (A * E1)
    f2 = (L + delta) / (A * E2)

    if rod == 1:
        epsilon = -1000 * (delta / L) * (f1 / (f1 + f2))
    if rod == 2:
        epsilon = -1000 * (delta / (L + delta)) * (f2 / (f1 + f2))

    data["params"]["E1"] = E1
    data["params"]["E2"] = E2
    data["params"]["alpha1"] = alpha1
    data["params"]["alpha2"] = alpha2
    data["params"]["L"] = L
    data["params"]["A"] = A
    data["params"]["deltaM"] = delta
    data["params"]["rod"] = rod

    data["correct_answers"]["epsilon"] = epsilon

    return data
