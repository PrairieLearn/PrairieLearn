import random


def generate(data):

    a, b, c, d = random.sample(range(2, 8), 4)
    x = random.randint(2, 5)
    degree = random.randint(2, 3)

    fun = [c, 2 * b * x, 3 * a * x**2]

    approx = 0
    for i in range(degree):
        approx += fun[i]

    data["correct_answers"]["deriv"] = approx
    data["params"]["x"] = x
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c
    data["params"]["d"] = d
    data["params"]["degree"] = degree
    return data
