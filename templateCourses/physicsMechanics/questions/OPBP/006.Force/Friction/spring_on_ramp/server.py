import math
import random
from collections import defaultdict

import numpy as np


def create_data2():
    nested_dict = lambda: defaultdict(nested_dict)
    return nested_dict()


def generate(data):
    data2 = create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "Spring on Ramp"
    data2["params"]["vars"]["units"] = "m"

    # define bounds of the variables
    m = random.randint(1, 10)
    theta = random.randint(25, 40)
    k = random.randint(2, 8) * 50
    us = random.randint(5, 7) / 10
    uk = random.randint(35, 40) / 100
    g = 9.8

    # store the variables in the dictionary "params"
    data2["params"]["m"] = m
    data2["params"]["theta"] = theta
    data2["params"]["k"] = k
    data2["params"]["us"] = us
    data2["params"]["uk"] = uk

    ## Part 1

    # define correct answers
    data2["correct_answers"]["part1_ans"] = round(
        (m * g / k)
        * (us * math.cos(math.radians(theta)) + math.sin(math.radians(theta))),
        2,
    )

    ## Part 2

    # define correct answers
    data2["correct_answers"]["part2_ans"] = round(
        (m * g / k)
        * (uk * math.cos(math.radians(theta)) + math.sin(math.radians(theta))),
        2,
    )

    # Update the data object with a new dict
    data.update(data2)
