import math
import random
from collections import defaultdict


def create_data2():
    nested_dict = lambda: defaultdict(nested_dict)
    return nested_dict()


def generate(data):
    data2 = create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "Angular Speed"
    data2["params"]["vars"]["units"] = "rad/s"

    # Randomize Variables
    rev = random.randint(2, 15)

    # store the variables in the dictionary "params"
    data2["params"]["rev"] = rev

    # define possible answers
    data2["params"]["part1"]["ans1"]["value"] = round((2 * math.pi) / rev, 2)
    data2["params"]["part1"]["ans1"]["correct"] = False

    data2["params"]["part1"]["ans2"]["value"] = round(rev * (math.pi), 2)
    data2["params"]["part1"]["ans2"]["correct"] = False

    data2["params"]["part1"]["ans3"]["value"] = round(rev * (2 * math.pi), 2)
    data2["params"]["part1"]["ans3"]["correct"] = True

    data2["params"]["part1"]["ans4"]["value"] = round(rev / (2 * math.pi), 2)
    data2["params"]["part1"]["ans4"]["correct"] = False

    # Update the data object with a new dict
    data.update(data2)
