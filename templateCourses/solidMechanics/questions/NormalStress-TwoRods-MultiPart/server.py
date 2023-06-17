import math
import random


def generate(data):

    a1 = random.randint(200, 300)  # mm^2
    a2 = random.randint(100, 200)  # mm^2
    p1 = random.randint(50, 80)  # kN
    p2 = random.randint(20, 120)  # kN
    sigma2 = 1000 * p2 / a2
    sigma1 = 1000 * (p2 - p1) / a1

    # Parameters
    data["params"]["a1"] = a1
    data["params"]["a2"] = a2
    data["params"]["p1"] = p1
    data["params"]["p2"] = p2

    # Answers
    data["correct_answers"]["sigma1"] = sigma1
    data["correct_answers"]["sigma2"] = sigma2

    return data
