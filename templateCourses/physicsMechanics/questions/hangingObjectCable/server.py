import math
import random
from re import A


def generate(data):

    xA = 60
    yA = 60
    yB = 80
    a = random.choice([100, 120, 140, 160])
    b = random.choice([100, 120, 140, 160])
    c = random.choice([120, 140, 160])
    d = a - 20
    xB = xA + b + c
    xC = xA + b
    yC = yA + a
    xD = xC
    yD = yC + 50

    data["params"]["xA"] = xA
    data["params"]["xB"] = xB
    data["params"]["xC"] = xC
    data["params"]["xD"] = xD
    data["params"]["yA"] = yA
    data["params"]["yB"] = yB
    data["params"]["yC"] = yC
    data["params"]["yD"] = yD
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c
    data["params"]["d"] = d

    g = 9.8
    T = random.randint(200, 300)
    data["params"]["T"] = T

    e = math.sqrt(a**2 + b**2)
    f = math.sqrt(c**2 + d**2)
    m1 = T / g * (c / f * a / b + d / f)
    m2 = T / g * f / c * b / e * (c / f * a / b + d / f)

    data["correct_answers"]["m"] = min(m1, m2)

    return data
