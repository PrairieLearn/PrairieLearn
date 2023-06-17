import math
import random


def generate(data):
    d = random.randint(50, 100)
    p1 = random.randint(1, 10)
    area1 = math.pi * (math.pow(d, 2) - math.pow((d / 2), 2)) / 4
    area2 = math.pi * math.pow(d, 2) / 4

    data["params"]["d"] = d
    data["params"]["p1"] = p1

    sigma2 = -1000 * p1 / area2
    sigma1 = -1000 * (p1) / area1

    data["correct_answers"]["sigma1"] = sigma1
    data["correct_answers"]["sigma2"] = sigma2

    return data
