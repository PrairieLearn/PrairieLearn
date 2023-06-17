import math
import random


def generate(data):
    tc = random.randint(500, 1000)
    tb = random.randint(500, 1000)
    G1 = random.randint(30, 45)
    G2 = random.randint(30, 45)
    d1 = random.randint(60, 80)
    d2 = random.randint(40, 50)
    L1 = random.randint(300, 400)
    L2 = random.randint(300, 400)

    J1 = math.pi * math.pow(d1, 4) / 32
    J2 = math.pi * math.pow(d2, 4) / 32

    phic = tc * L2 / (G2 * J2) + (tc - tb) * L1 / (G1 * J1)

    data["params"]["tc"] = tc
    data["params"]["tb"] = tb
    data["params"]["G1"] = G1
    data["params"]["G2"] = G2
    data["params"]["d1"] = d1
    data["params"]["d2"] = d2
    data["params"]["L1"] = L1
    data["params"]["L2"] = L2

    data["correct_answers"]["phic"] = phic

    return data
