import math
from random import randint


def generate(data):

    tol_exp = randint(-9, -5)

    which = randint(0, 2)
    if which == 0:
        equat = "e^x \\cdot x"
        f = lambda x: math.exp(x) * x
        fp = lambda x: math.exp(x) * (x + 1)
        x0 = randint(30, 50) / 10

    elif which == 1:
        equat = "x \\cdot \\sin(x)"
        f = lambda x: x * math.sin(x)
        fp = lambda x: math.sin(x) + x * math.cos(x)
        x0 = randint(20, 60) / 10

    elif which == 2:
        equat = "x \\cdot (3 - x)^2"
        f = lambda x: x * (3 - x) ** 2
        fp = lambda x: 3 * x**2 - 12 * x + 9
        x0 = randint(11, 55) / 10

    num_its = 0
    x1 = x0
    while abs(f(x1)) >= 10 ** (tol_exp):
        x1 = x1 - f(x1) / fp(x1)
        num_its += 1

    data["params"]["x0"] = x0
    data["params"]["equation"] = equat
    data["params"]["tolerance"] = "10^{" + str(tol_exp) + "}"

    data["correct_answers"]["num_its"] = num_its
