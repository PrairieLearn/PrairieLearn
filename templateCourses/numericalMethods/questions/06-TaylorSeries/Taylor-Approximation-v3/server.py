import random


def fact(n):
    if n <= 1:
        return 1
    else:
        return n * fact(n - 1)


def generate(data):

    a, b, c, d = random.sample(range(2, 8), 4)
    x = random.randint(2, 5)
    x0 = 0
    degree = random.randint(2, 3)

    fun = [
        a * x0**3 + b * x0**2 + c * x0 + d,
        3 * a * x0**2 + 2 * b * x0 + c,
        6 * a * x0 + 2 * b,
        6 * a,
    ]

    approx = 0

    for k in range(degree + 1):
        approx += fun[k] * ((x) ** k) / fact(k)

    data["params"]["x"] = x

    data["correct_answers"]["deriv"] = approx
    data["params"]["x"] = x
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c
    data["params"]["d"] = d
    data["params"]["degree"] = degree
    return data
