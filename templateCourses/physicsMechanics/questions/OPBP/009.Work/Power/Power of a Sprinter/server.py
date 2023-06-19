import random
from collections import defaultdict


def create_data2():
    nested_dict = lambda: defaultdict(nested_dict)
    return nested_dict()


def generate(data):
    data2 = create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "Power of a Sprinter"
    data2["params"]["vars"]["units"] = "W"

    # define bounds of the variables
    m = random.randint(55, 90)
    v = random.randint(8, 11)
    t = random.randint(1, 5)
    v2 = random.randint(1, 8)

    a = v / t

    # store the variables in the dictionary "params"
    data2["params"]["v"] = v
    data2["params"]["t"] = t
    data2["params"]["m"] = m
    data2["params"]["v2"] = v2

    ## Part 1

    # define correct answers
    data2["correct_answers"]["part1_ans"] = m * a * v2

    # Update the data object with a new dict
    data.update(data2)
