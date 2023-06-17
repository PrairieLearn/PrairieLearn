import math
import random


def generate(data):
    t = random.randint(15, 20)
    M = random.choice([-1, 1]) * random.randint(1500, 1800)
    option = random.choice(["compressive", "tensile"])

    ybar = 2.5 * t

    Iz = 848 * math.pow(t, 4) / 3
    Iz = Iz / math.pow(10, 6)

    sigmatop = -M * (4.5 * t) / Iz
    sigmabottom = M * (5.5 * t) / Iz
    sigma = 0

    if option == "compressive":
        if sigmatop < 0:
            sigma = sigmatop
        else:
            sigma = sigmabottom
    if option == "tensile":
        if sigmatop > 0:
            sigma = sigmatop
        else:
            sigma = sigmabottom

    sigma = math.fabs(sigma) / 1000

    data["params"]["t"] = t
    data["params"]["M"] = M
    data["params"]["option"] = option

    data["correct_answers"]["sigma"] = sigma
    data["correct_answers"]["ybar"] = ybar
    data["correct_answers"]["Iz"] = Iz

    return data
