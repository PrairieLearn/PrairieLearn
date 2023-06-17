import math
import random


def generate(data):
    td = random.randint(20, 50)
    rb = random.randint(70, 80)
    rc = random.randint(30, 40)
    d = random.randint(12, 16)

    ta = (rb / rc) * td * 1000

    tau1 = 16 * ta / (math.pi * math.pow(d, 3))

    data["params"]["td"] = td
    data["params"]["rb"] = rb
    data["params"]["rc"] = rc
    data["params"]["d"] = d

    data["correct_answers"]["tau1"] = tau1

    return data
