import math
import random


def generate(data):
    tc = random.randint(500, 1000)
    tb = random.randint(1000, 1500)
    d = random.randint(60, 80)

    di = d / 2

    den1 = math.pi * (math.pow(d, 4) - math.pow(di, 4))
    den2 = math.pi * (math.pow(d, 3))

    tau1 = math.fabs(1000 * 16 * (tb - tc) * d / den1)
    tau2 = math.fabs(1000 * 16 * tc / den2)

    taumax = tau1
    if tau2 > taumax:
        taumax = tau2

    data["params"]["tc"] = tc
    data["params"]["tb"] = tb
    data["params"]["d"] = d

    data["correct_answers"]["taumax"] = taumax

    return data
