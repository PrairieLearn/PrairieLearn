import random


def generate(data):

    a = random.randint(90, 120)
    b = random.randint(90, 120)
    c = 160
    P = random.randint(50, 120)

    FB = 0
    MB = P * c / 2
    FE = P
    ME = 0

    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c
    data["params"]["P"] = P

    data["correct_answers"]["FB"] = FB
    data["correct_answers"]["MB"] = MB
    data["correct_answers"]["FE"] = FE
    data["correct_answers"]["ME"] = ME

    return data
