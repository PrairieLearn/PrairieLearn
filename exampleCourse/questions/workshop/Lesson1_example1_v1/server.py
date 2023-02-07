import random


def generate(data):
    a = random.randint(1, 10)
    data["params"]["a"] = a

    b = random.randint(2, 5)
    data["params"]["b"] = b

    equation = "$y = " + str(a) + " - x^{" + str(b) + "}$"
    data["params"]["equation"] = equation

    x2 = a ** (1 / b)
    A = a * x2 - x2 ** (b + 1) / (b + 1)

    data["correct_answers"]["A"] = A
