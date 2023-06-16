import math
import random


def fp1(x):
    return -math.sin(x)


def fpp1(x):
    return -math.cos(x)


def fp2(x):
    return -math.exp(-(x**2)) * (-2 * x)


def fpp2(x):
    return -math.exp(-(x**2)) * (-2) + (-math.exp(-(x**2)) * (-2 * x) * (-2 * x))


def generate(data):
    x = random.choice(range(25, 50, 5)) / 100

    if random.choice([True, False]):
        h = -(fp1(x) / fpp1(x))
        data["params"]["f"] = "\\cos(x)"
    else:
        h = -(fp2(x) / fpp2(x))
        data["params"]["f"] = "-e^{-x^2}"
    data["params"]["x"] = x
    data["correct_answers"]["ans"] = x + h

    return data
