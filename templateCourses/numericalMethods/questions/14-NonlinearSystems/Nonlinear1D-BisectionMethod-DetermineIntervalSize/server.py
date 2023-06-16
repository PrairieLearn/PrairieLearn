import random


def generate(data):

    a = random.randint(2, 5)
    L = random.randint(-12, -6)
    R = random.randint(7, 12)
    n = random.randint(3, 4)

    h0 = R - L
    h = h0 * (0.5) ** n

    data["params"]["a"] = a
    data["params"]["n"] = n
    data["params"]["L"] = L
    data["params"]["R"] = R

    data["correct_answers"]["h"] = h

    return data
