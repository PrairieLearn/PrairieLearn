import random


def generate(data):

    xo = random.choice([-0.4, -0.2, 0.2, 0.6])
    x1 = random.choice([-0.6, -0.3, 0.3, 0.4])
    n = random.choice([4, 5])

    def f2(x):
        return x - (x**2) / 2.0

    def df3(x):
        return 1 - x + x**2

    # second derivative of degree 3
    def d2f3(x):
        return -1 + 2 * x

    f = f2(xo)
    d2f = d2f3(x1)

    if n == 4:
        bigOapprox = "$x - \\frac{x^2}{2} + \\frac{x^3}{3}$"
    elif n == 5:
        bigOapprox = "$x - \\frac{x^2}{2} + \\frac{x^3}{3} - \\frac{x^4}{4}$"

    data["params"]["xo"] = xo
    data["params"]["x1"] = x1
    data["params"]["bigOapprox"] = bigOapprox

    data["correct_answers"]["f"] = f
    data["correct_answers"]["n"] = n
    data["correct_answers"]["d2f"] = d2f

    return data
