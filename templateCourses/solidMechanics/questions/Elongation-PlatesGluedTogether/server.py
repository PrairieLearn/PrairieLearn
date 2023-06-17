import math
import random


def generate(data):

    k1 = random.randint(35, 45)
    k2 = random.randint(10, 20)
    L = random.randint(20, 24)
    deltaM = random.randint(1, 3)
    n = random.randint(1, 2)

    delta = 0
    epsilon = 0

    if n == 1:
        delta = k2 * deltaM / (k1 + k2)
        epsilon = 1000 * delta / (100 * L - deltaM)
    elif n == 2:
        delta = -k1 * deltaM / (k1 + k2)
        epsilon = 1000 * delta / (L * 100)

    k1long = k1 * 1000
    k2long = k2 * 1000
    Lexp = L * 100

    data["params"]["k1"] = k1
    data["params"]["k2"] = k2
    data["params"]["n"] = n
    data["params"]["L"] = L
    data["params"]["deltaM"] = deltaM
    data["params"]["k1long"] = k1long
    data["params"]["k2long"] = k2long
    data["params"]["Lexp"] = Lexp

    data["correct_answers"]["epsilon"] = epsilon

    return data
