import math
import random


def generate(data):

    te = random.randint(400, 500)
    n = random.randint(2, 4)
    r2 = random.randint(45, 50)
    d = random.randint(30, 36)
    L = random.randint(120, 150)
    G = random.randint(70, 80)

    r1 = n * r2
    phie = (
        (1 + math.pow((r2 / r1), 2) + math.pow((r2 / r1), 4))
        * (32 * te * L)
        / (G * math.pi * math.pow(d, 4))
    )

    data["params"]["te"] = te
    data["params"]["r1"] = r1
    data["params"]["r2"] = r2
    data["params"]["d"] = d
    data["params"]["L"] = L
    data["params"]["G"] = G

    data["correct_answers"]["phie"] = phie

    return data
