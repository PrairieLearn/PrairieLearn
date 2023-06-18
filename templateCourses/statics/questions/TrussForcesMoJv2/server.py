import math
import random


def generate(data):

    a = random.randint(4, 5)
    b = random.randint(3, 4)

    F1 = 100 * random.randint(3, 5)
    F2 = 100 * random.randint(3, 5)

    Ay = (F2 * a + F1 * b) / (2 * b)

    F_AD = Ay * b / a
    F_AB = -Ay / a * math.sqrt(a**2 + b**2)
    F_BD = (F2 - F_AD) / b * math.sqrt(a**2 + b**2)
    F_CD = -F_BD * a / math.sqrt(a**2 + b**2)
    F_BC = -F2

    ans1 = random.choice(["AB", "CD"])
    if ans1 == "AB":
        ansT1 = F_AB
    else:
        ansT1 = F_CD

    ans2 = random.choice(["AD", "BC", "BD"])
    if ans2 == "AD":
        ansT2 = F_AD
    elif ans2 == "BC":
        ansT2 = F_BC
    else:
        ansT2 = F_BD

    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["F1"] = F1
    data["params"]["F2"] = F2

    data["params"]["ans1"] = ans1
    data["params"]["ans2"] = ans2

    data["correct_answers"]["ansT1"] = ansT1
    data["correct_answers"]["ansT2"] = ansT2

    return data
