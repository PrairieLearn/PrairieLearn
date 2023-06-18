import math
import random


def generate(data):

    f = 10 * (random.randint(10, 25))
    alpha = random.choice([20, 25, 30, 35, 40, 45])
    r = random.choice([0.4, 0.5, 0.6])

    rx = -f * math.sin(math.radians(alpha))
    ry = f + (f * math.cos(math.radians(alpha)))

    data["params"]["alpha"] = alpha
    data["params"]["m"] = f
    data["params"]["r"] = r

    data["correct_answers"]["rx"] = rx
    data["correct_answers"]["ry"] = ry

    return data
