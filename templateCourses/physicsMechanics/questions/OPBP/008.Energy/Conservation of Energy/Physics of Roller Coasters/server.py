import math
import random as rd
from collections import defaultdict


def create_data2():
    nested_dict = lambda: defaultdict(nested_dict)
    return nested_dict()


def generate(data):
    data2 = create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "Physics of Roller-Coasters"
    data2["params"]["vars"]["units"] = "m/s"

    # Randomize Variables and round
    r = round(rd.uniform(10.0, 30.0), 1)

    # store the variables in the dictionary "params"
    data2["params"]["r"] = r

    # define g
    g = 9.81

    # define possible answers
    data2["params"]["part1"]["ans1"]["value"] = round(math.sqrt(4 * g * r), 1)
    data2["params"]["part1"]["ans1"]["correct"] = False

    data2["params"]["part1"]["ans2"]["value"] = round(math.sqrt(5 * g * r), 1)
    data2["params"]["part1"]["ans2"]["correct"] = True

    data2["params"]["part1"]["ans3"]["value"] = round(math.sqrt(3 * g * r), 1)
    data2["params"]["part1"]["ans3"]["correct"] = False

    data2["params"]["part1"]["ans4"]["value"] = round(math.sqrt(2 * g * r), 1)
    data2["params"]["part1"]["ans4"]["correct"] = False

    data2["params"]["part1"]["ans5"]["value"] = round(math.sqrt(g * r), 1)
    data2["params"]["part1"]["ans5"]["correct"] = False

    data2["params"]["part1"]["ans6"]["value"] = round(math.sqrt(6 * g * r), 1)
    data2["params"]["part1"]["ans6"]["correct"] = False

    # Update the data object with a new dict
    data.update(data2)
