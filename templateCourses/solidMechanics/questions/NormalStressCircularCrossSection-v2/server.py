import math
import random


def generate(data):
    A = random.randint(200, 300)
    sigma = random.randint(180, 220)

    data["params"]["A"] = A
    data["params"]["sigma"] = sigma

    F = (1 / 1000) * sigma * A / 3

    data["correct_answers"]["F"] = math.fabs(F)

    return data
