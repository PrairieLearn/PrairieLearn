import math
import random


def generate(data):

    # Initialization
    w = random.randint(500, 1000)
    l = random.uniform(3.5, 7.5)
    alpha = random.randint(15, 30)
    beta = random.randint(45, 75)

    dega = math.radians(alpha)
    degb = math.radians(beta)
    ansx = l / (1 + (math.tan(degb) / math.tan(dega)))

    # output randomized problem conditions
    data["params"]["l"] = format(l, ".2f")
    data["params"]["w"] = w
    data["params"]["alpha"] = alpha
    data["params"]["beta"] = beta

    # output answer
    data["correct_answers"]["ansx"] = ansx

    return data
