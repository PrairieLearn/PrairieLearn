import math
import random as rd
from collections import defaultdict


def create_data2():
    nested_dict = lambda: defaultdict(nested_dict)
    return nested_dict()


def generate(data):
    data2 = create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "Collision of a Cart with a Spring"
    data2["params"]["vars"]["units"] = "m/s"

    # define bounds of the variables
    m = rd.randint(10, 100)
    k = rd.randint(200, 400)
    x = rd.randint(20, 100)

    # store the variables in the dictionary "params"
    data2["params"]["m"] = m
    data2["params"]["k"] = k
    data2["params"]["x"] = x

    # define correct answers
    data2["correct_answers"]["part1_ans"] = math.sqrt(k / m) * (x / 100)

    # Update the data object with a new dict
    data.update(data2)
