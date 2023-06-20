import random
from collections import defaultdict

import numpy as np

nested_dict = lambda: defaultdict(nested_dict)


def generate(data):
    # Start problem code
    data2 = nested_dict()

    # define bounds of the variables
    q = round(random.uniform(0.1, 1), 3)
    v = random.randint(500, 700)

    # store the variables in the dictionary "params"
    data2["params"]["q"] = q
    data2["params"]["v"] = v

    # defining constants
    B = 8e-5  # T

    ## Part 1

    # calculating the correct solution
    F = B * q * 1e-6 * v

    # Put the solutions into data['correct_answers']
    data2["correct_answers"]["part1_ans"] = F

    # define possible answers

    data2["params"]["part2"]["ans1"]["value"] = "North"
    data2["params"]["part2"]["ans1"]["correct"] = True

    data2["params"]["part2"]["ans2"]["value"] = "South"
    data2["params"]["part2"]["ans2"]["correct"] = False

    data2["params"]["part2"]["ans3"]["value"] = "East"
    data2["params"]["part2"]["ans3"]["correct"] = False

    data2["params"]["part2"]["ans4"]["value"] = "West"
    data2["params"]["part2"]["ans4"]["correct"] = False

    # Update the data object with a new dict
    data.update(data2)
