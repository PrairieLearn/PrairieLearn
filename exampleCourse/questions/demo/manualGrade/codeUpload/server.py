import random


def generate(data):
    data["params"]["starting_index"] = random.choice([0, 1])
    data["params"]["second_index"] = data["params"]["starting_index"] + 1
