import random


def generate(data):
    ma = random.randint(4, 8)
    data["params"]["ma"] = ma
    data["correct_answers"]["F"] = ma * 10
