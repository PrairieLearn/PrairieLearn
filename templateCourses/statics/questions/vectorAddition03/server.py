import math
import random


def generate(data):
    k = random.randint(2, 10)
    d = random.randint(1, 5)

    F_1 = k * d
    F_R = round(1.5 * F_1)

    a = (F_R / F_1) * 0.6 + 2 / math.sqrt(29)
    b = (F_R / F_1) * 0.8 - 5 / math.sqrt(29)
    alpha = math.atan(b / a)
    alpha_deg = alpha * (180 / math.pi)
    F_2 = (b * F_1) / math.sin(alpha)

    # Put these two integers into data['params']
    data["params"]["k"] = k
    data["params"]["d"] = d
    data["params"]["F_R"] = F_R

    data["correct_answers"]["alpha_deg"] = alpha_deg
    data["correct_answers"]["F_2"] = F_2

    return data
