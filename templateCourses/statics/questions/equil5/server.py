import random


def generate(data):

    a = random.randint(3, 6)
    f = random.randint(20, 40)
    w = random.randint(6, 10)

    cx = 0
    cy = 0.75 * a * w + 1.5 * f
    cz = 0

    data["params"]["a"] = a
    data["params"]["f"] = f
    data["params"]["w"] = w

    data["correct_answers"]["cx"] = cx
    data["correct_answers"]["cy"] = cy
    data["correct_answers"]["cz"] = cz

    return data
