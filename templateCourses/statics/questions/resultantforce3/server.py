import math
import random


def generate(data):

    F1x = random.randint(2, 4)
    F1y = -1 * F1x

    F2x = -0.5 * random.randint(2, 4)
    F2y = F2x

    F3x = -0.3 * random.randint(2, 4)
    F3y = 0

    X1 = 0.01 * random.randint(8, 10)
    X2 = 0.015 * random.randint(8, 10)
    Y1 = 0.025 * random.randint(8, 10)
    Y2 = 0.015 * random.randint(8, 10)
    Y3 = 0.01 * random.randint(8, 10)

    Fx = F1x + F2x + F3x
    Fy = F1y + F2y + F3y
    F = math.sqrt(math.pow(Fx, 2) + math.pow(Fy, 2))

    M = abs(-(F1x * Y1) + (F2x * Y2) - (F3x * Y3) - (F2y * X2) - (F1y * X1))

    data["params"]["F1x"] = F1x
    data["params"]["F1y"] = F1y
    data["params"]["F2x"] = F2x
    data["params"]["F2y"] = F2y
    data["params"]["F3x"] = F3x
    data["params"]["F3y"] = F3y
    data["params"]["X1"] = X1
    data["params"]["X2"] = X2
    data["params"]["Y1"] = Y1
    data["params"]["Y2"] = Y2
    data["params"]["Y3"] = Y3

    data["correct_answers"]["F"] = F
    data["correct_answers"]["M"] = M

    return data
