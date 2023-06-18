import math
import random


def generate(data):

    p = random.randint(25, 35)
    l = random.randint(150, 170)
    theta = random.randint(30, 50)

    thetarad = theta / 180 * math.pi
    lb = l / 100

    optionPoint = random.choice(["A", "B"])
    if optionPoint == "B":
        Mx = 0
        My = 0
        Mz = -p * lb
    if optionPoint == "A":
        Mx = 0
        My = 0
        Mz = -(
            p * lb * (math.cos(thetarad)) * (1 + (math.cos(thetarad)))
            + p * lb * (math.sin(thetarad)) * (math.sin(thetarad))
        )

    data["params"]["p"] = p
    data["params"]["l"] = lb
    data["params"]["theta"] = theta
    data["params"]["optionPoint"] = optionPoint

    data["correct_answers"]["Mx"] = Mx
    data["correct_answers"]["My"] = My
    data["correct_answers"]["Mz"] = Mz

    return data
