import random as rd
from collections import defaultdict


def create_data2():
    nested_dict = lambda: defaultdict(nested_dict)
    return nested_dict()


def generate(data):
    data2 = create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "The Energy Expenditure of a Jogger"
    data2["params"]["vars"]["units"] = "W"

    # Randomize Variables
    F = rd.randint(15, 35)
    v = round(rd.uniform(3.0, 8.0), 1)

    # store the variables in the dictionary "params"
    data2["params"]["F"] = F
    data2["params"]["v"] = v

    # define possible answers
    data2["params"]["part1"]["ans1"]["value"] = round(F * v * 0.10, 1)
    data2["params"]["part1"]["ans1"]["correct"] = False

    data2["params"]["part1"]["ans2"]["value"] = round(F * v, 1)
    data2["params"]["part1"]["ans2"]["correct"] = True

    data2["params"]["part1"]["ans3"]["value"] = round(F * v * v, 1)
    data2["params"]["part1"]["ans3"]["correct"] = False

    data2["params"]["part1"]["ans4"]["value"] = round(2 * F * v, 1)
    data2["params"]["part1"]["ans4"]["correct"] = False

    data2["params"]["part1"]["ans5"]["value"] = round(3 * F * v, 1)
    data2["params"]["part1"]["ans5"]["correct"] = False

    data2["params"]["part1"]["ans6"]["value"] = round(0.5 * F * v, 1)
    data2["params"]["part1"]["ans6"]["correct"] = False

    # Update the data object with a new dict
    data.update(data2)
