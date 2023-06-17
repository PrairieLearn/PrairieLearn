import math
import random


def generate(data):

    tb = random.randint(1200, 1500)
    d = random.randint(45, 60)
    G = random.randint(50, 80)
    L = random.randint(100, 200)

    di = d / 2

    J1 = math.pi * (math.pow(d, 4) - math.pow(di, 4)) / 32
    J2 = math.pi * (math.pow(d, 4)) / 32

    phib = tb * L / (G * (J1 + J2))

    data["params"]["G"] = G
    data["params"]["tb"] = tb
    data["params"]["d"] = d
    data["params"]["L"] = L

    data["correct_answers"]["phib"] = phib

    return data
