import math
import random
from collections import defaultdict


def create_data2():
    nested_dict = lambda: defaultdict(nested_dict)
    return nested_dict()


def generate(data):
    data2 = create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "Rock on a String"
    data2["params"]["vars"]["units"] = "m/s"

    # Randomize Variables
    m = random.randint(1, 5) * 0.25
    r = random.randint(20, 90)
    T = random.randint(1, 5) * 100

    # store the variables in the dictionary "params"
    data2["params"]["m"] = m
    data2["params"]["r"] = r
    data2["params"]["T"] = T

    # define possible answers
    data2["params"]["part1"]["ans1"]["value"] = round(math.sqrt((r / 100) * T / m), 0)
    data2["params"]["part1"]["ans1"]["correct"] = True

    data2["params"]["part1"]["ans2"]["value"] = round(
        math.sqrt((r / 100) * T / m) - 10, 0
    )
    data2["params"]["part1"]["ans2"]["correct"] = False

    data2["params"]["part1"]["ans3"]["value"] = round(
        math.sqrt(((r / 100) / 2) * T / m) + 10, 0
    )
    data2["params"]["part1"]["ans3"]["correct"] = False

    data2["params"]["part1"]["ans4"]["value"] = round(
        math.sqrt((r / 100) * T / m) - 20, 0
    )
    data2["params"]["part1"]["ans4"]["correct"] = False

    data2["params"]["part1"]["ans5"]["value"] = round(
        math.sqrt((r / 100) * T / m) + 20, 0
    )
    data2["params"]["part1"]["ans5"]["correct"] = False

    # Update the data object with a new dict
    data.update(data2)
