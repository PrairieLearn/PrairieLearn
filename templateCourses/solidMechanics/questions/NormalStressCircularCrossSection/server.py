import math
import random


def generate(data):

    A = random.randint(1, 10)
    F = random.randint(100, 200)
    sigma = F / A

    data["params"]["A"] = A
    data["params"]["F"] = F

    data["correct_answers"]["sigma"] = math.fabs(sigma)

    return data
