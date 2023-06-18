import math
import random


def generate(data):

    f1 = random.randint(1, 10)
    f2 = random.randint(1, 10)
    alpha = random.randint(30, 50)
    beta = random.randint(40, 60)
    alpharad = (math.pi * alpha) / 180.0
    betarad = (math.pi * beta) / 180.0

    fx = (f1 * math.cos(alpharad)) + (f2 * math.cos(betarad))
    fy = (f1 * math.sin(alpharad)) - (f2 * math.sin(betarad))

    # Resultant magnitude
    fmag = math.sqrt(math.pow(fx, 2) + math.pow(fy, 2))

    # Put these two integers into data['params']
    data["params"]["f1"] = f1
    data["params"]["f2"] = f2
    data["params"]["alpha"] = alpha
    data["params"]["beta"] = beta

    data["correct_answers"]["fx"] = fx
    data["correct_answers"]["fy"] = fy
    data["correct_answers"]["fmag"] = fmag

    return data
