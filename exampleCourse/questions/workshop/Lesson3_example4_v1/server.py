import random


def generate(data):
    x = random.choice([0, 1])
    y = random.choice([0, 1])
    z = random.choice([0, 1])

    data["params"]["x"] = x
    data["params"]["y"] = y
    data["params"]["z"] = z

    F = ((not y) and z) or x

    data["correct_answers"]["F"] = F
