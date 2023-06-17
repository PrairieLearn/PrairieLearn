import math
import random


def generate(data):
    L = random.randint(5, 8)
    E = random.randint(150, 250)
    Iz = random.randint(40, 60)
    w = random.randint(6, 12)

    IzVar = Iz * math.pow(10, -6)

    imgFile = "Picture1.png"

    yc = 1000 * 19 * w * math.pow(L, 4) / (128 * E * Iz)

    data["params"]["imgFile"] = imgFile
    data["params"]["L"] = L
    data["params"]["E"] = E
    data["params"]["w"] = w
    data["params"]["Iz"] = Iz
    data["params"]["IzVar"] = IzVar

    data["correct_answers"]["yc"] = yc

    return data
