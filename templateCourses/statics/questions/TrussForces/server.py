import math
import random


def generate(data):

    a = random.randint(3, 4)
    b = random.randint(3, 5)

    F1 = 100 * random.randint(3, 6)
    F2 = 100 * random.randint(10, 14)

    # moment at A
    F_D = (F1 * a + F2 * 2 * b) / (3 * b)

    # moment aboud C
    F_GE = (F1 * a - F_D * b) / a

    # moment about G
    F_BC = (F_D * 2 * b - F2 * b) / a

    # force along y direction
    F_GC = math.sqrt(a**2 + b**2) / a * (F2 - F_D)

    # force along y direction
    F_EC = F_D

    # force along x direction
    F_CD = F1 - F_GE

    ans1 = random.choice(["BC", "GC", "EC", "CD"])
    if ans1 == "BC":
        ansT1 = F_BC
    elif ans1 == "GC":
        ansT1 = F_GC
    elif ans1 == "EC":
        ansT1 = F_EC
    else:
        ansT1 = F_CD

    ans2 = "GE"
    ansT2 = F_GE

    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["F1"] = F1
    data["params"]["F2"] = F2

    data["params"]["ans1"] = ans1
    data["params"]["ans2"] = ans2

    data["correct_answers"]["ansT1"] = ansT1
    data["correct_answers"]["ansT2"] = ansT2

    return data
