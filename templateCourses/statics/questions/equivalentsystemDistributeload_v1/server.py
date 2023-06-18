import random


def generate(data):

    a = random.randint(1, 2)
    b = random.randint(5, 6)
    c = random.randint(1, 2)
    w = random.randint(2, 3)

    direction = random.choice(["left", "right"])

    F = 1 / 2 * b * w

    M = (a + 2 / 3 * b) * F

    if direction == "left":
        x = M / F
    else:
        x = a + b + c - M / F

    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c
    data["params"]["w"] = w

    data["params"]["direction"] = direction
    data["correct_answers"]["F"] = F
    data["correct_answers"]["x"] = x

    return data
