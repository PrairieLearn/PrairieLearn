import random


def generate(data):
    e = random.randint(6, 12)
    exp = 10 * e
    data["params"]["exp"] = exp
    return data
