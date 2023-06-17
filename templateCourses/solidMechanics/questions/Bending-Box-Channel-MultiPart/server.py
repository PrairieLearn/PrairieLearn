import math
import random


def generate(data):
    h = random.randint(140, 160)
    t2 = random.randint(20, 25)
    t1 = random.randint(20, 25)
    b = random.randint(230, 250)
    M = random.randint(1200, 1500)

    ybar = h / 2 + t2

    Iz = (b + 2 * t1) * math.pow(h + 2 * t2, 3) / 12 - b * math.pow(h, 3) / 12

    Iz = Iz / math.pow(10, 6)

    sigma = M * ybar / Iz

    sigma = sigma / 1000

    data["params"]["b"] = b
    data["params"]["h"] = h
    data["params"]["t1"] = t1
    data["params"]["t2"] = t2
    data["params"]["M"] = M

    data["correct_answers"]["sigma"] = sigma
    data["correct_answers"]["ybar"] = ybar
    data["correct_answers"]["Iz"] = Iz

    return data
