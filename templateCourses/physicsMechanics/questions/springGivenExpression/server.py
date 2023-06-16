import math
import random


def generate(data):

    den = random.randint(2, 5)
    power = random.randint(2, 4)
    data["params"]["den"] = den
    data["params"]["power"] = power

    xi = random.choice([2, 3])
    xf = random.randint(5, 6)
    data["params"]["xi"] = xi
    data["params"]["xf"] = xf

    k1 = random.randint(200, 300)
    W = k1 / (den * (power + 1)) * (xf ** (power + 1) - xi ** (power + 1))
    W = round(W / 1000, 1)
    data["params"]["W"] = W

    k = 1e3 * W * den * (power + 1) / (xf ** (power + 1) - xi ** (power + 1))
    data["correct_answers"]["k"] = k
