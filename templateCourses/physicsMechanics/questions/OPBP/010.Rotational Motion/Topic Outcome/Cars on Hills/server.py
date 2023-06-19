import random
from collections import defaultdict


def create_data2():
    nested_dict = lambda: defaultdict(nested_dict)
    return nested_dict()


def generate(data):
    data2 = create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "Cars on Hills"
    data2["params"]["vars"]["units"] = "$\rm{\frac{m}{s^2}}$"

    # define bounds of the variables
    v = random.randint(10, 30)
    r = random.randint(100, 300)
    mu = random.randint(500, 900) / 100

    # store the variables in the dictionary "params"
    data2["params"]["v"] = v
    data2["params"]["r"] = r
    data2["params"]["mu"] = mu

    ## Part 1

    # define correct answers
    data2["correct_answers"]["part1_ans"] = round(-0.850 * (9.8 + (v**2 / r)), 3)

    ## Part 2

    # define correct answers
    data2["correct_answers"]["part2_ans"] = round(-0.850 * (9.8 - (v**2 / r)), 3)

    # Update the data object with a new dict
    data.update(data2)
