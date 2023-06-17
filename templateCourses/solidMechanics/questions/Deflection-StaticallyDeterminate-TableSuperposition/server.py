import math
import random


def generate(data):
    L = random.randint(5, 8)
    E = random.randint(150, 250)
    A = random.randint(180, 220)
    H = random.randint(2, 4)
    Iz = random.randint(40, 60)
    P = random.randint(3, 6)

    IzVar = Iz * math.pow(10, 6)

    imgFile = "Picture1.png"

    yb = 1000 * (P * math.pow(L, 3) / (48 * E * Iz) + P * H / (4 * E * A))

    data["params"]["imgFile"] = imgFile
    data["params"]["L"] = L
    data["params"]["E"] = E
    data["params"]["A"] = A
    data["params"]["H"] = H
    data["params"]["P"] = P
    data["params"]["Iz"] = Iz
    data["params"]["IzVar"] = IzVar

    data["correct_answers"]["yb"] = yb

    return data
