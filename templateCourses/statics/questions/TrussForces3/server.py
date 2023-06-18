import math
import random


def generate(data):

    a = random.randint(3, 4)
    b = random.randint(3, 5)
    c = b
    P_D = 3
    P_B = 4

    theta = math.atan(a / c)  # theta is already in radian

    # moment A
    Nc = (a * P_D + b * P_B) / (b + c)

    # x force at A
    Ax = P_D

    # y force at A
    Ay = -Nc + P_B

    # y force at C
    F_CD = Nc / math.sin(theta)

    # x force at C
    F_CB = F_CD * math.cos(theta)

    # y force at A
    F_AD = Ay / math.sin(theta)  # Down left

    # x force at A
    F_AB = Ax + F_AD * math.cos(theta)  # Heading Right

    # y force at B
    F_BD = P_B  # upward

    ans1 = random.choice(["CD", "CB", "AD", "AB"])
    if ans1 == "CD":
        ansT1 = -F_CD  # compression
    elif ans1 == "CB":
        ansT1 = F_CB  # tension
    elif ans1 == "AD":
        ansT1 = -F_AD  # compression
    else:
        ansT1 = F_AB  # tension

    ## always same
    ans2 = "BD"
    ansT2 = F_BD

    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = b
    data["params"]["P_B"] = P_B
    data["params"]["P_D"] = P_D

    data["params"]["ans1"] = ans1
    data["params"]["ans2"] = ans2

    data["correct_answers"]["ansT1"] = ansT1
    data["correct_answers"]["ansT2"] = ansT2

    return data
