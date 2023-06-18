import math
import random


def generate(data):

    a = random.randint(1, 3)
    W = random.randint(7, 15)
    P = random.randint(1, 2)
    F = random.randint(2, 4)
    Fp = P * math.sqrt(2)

    Fx = F + math.sqrt(2) / 2 * Fp
    Fy = -(W + math.sqrt(2) / 2 * Fp)

    M = (W * a) / 3 - F * a / 3 - math.sqrt(2) / 2 * Fp * a

    data["params"]["a"] = a
    data["params"]["W"] = W
    data["params"]["P"] = P
    data["params"]["F"] = F
    data["params"]["Fp"] = Fp

    data["correct_answers"]["Fx"] = Fx
    data["correct_answers"]["Fy"] = Fy
    data["correct_answers"]["M"] = M

    return data
