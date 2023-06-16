import random


def generate(data):
    data["params"]["a"] = random.randint(10, 25)
    data["params"]["b"] = random.randint(5, 7)
    data["params"]["c"] = random.randint(5, 7)
    data["params"]["d"] = random.randint(10, 25)

    data["params"]["tol"] = random.randint(5, 10)

    data["correct_answers"]["ans"] = 1

    return data
