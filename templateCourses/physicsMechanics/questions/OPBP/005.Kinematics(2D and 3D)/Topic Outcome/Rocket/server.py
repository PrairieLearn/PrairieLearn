import random
from collections import defaultdict

import prairielearn as pl
import sympy as sp


def generate(data):
    data2 = create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "Rocket"
    data2["params"]["vars"]["units1"] = "$m/s^2$"
    data2["params"]["vars"]["units2"] = "$s$"

    # define bounds of the variables
    i = random.randint(2, 6)
    t_1 = random.randint(0, 3)
    t_2 = random.randint(4, 6)

    # store the variables in the dictionary "params"
    data2["params"]["v_1"] = i
    data2["params"]["t_1"] = t_1
    data2["params"]["t_2"] = t_2

    # Declare math symbols to be used by sympy
    t = sp.symbols("t")

    ## Part 1

    # Describe the solution equation
    height = t**2 * i / 2 - t**3 / 3

    # Answer to fill in the blank input -- must be stored as JSON.
    data2["correct_answers"]["part1_ans"] = pl.to_json(height)

    ## Part 2

    # Describe the solution equation
    acc = i - t * 2

    # Answer to fill in the blank input -- must be stored as JSON.
    data2["correct_answers"]["part2_ans"] = pl.to_json(acc)

    ## Part 3

    # define correct answers
    Aavg = (((i * t_2) - ((t_2) ** 2)) - ((i * t_1) - ((t_1) ** 2))) / (t_2 - t_1)
    data2["correct_answers"]["part3_ans"] = Aavg

    ## Part 4

    # define correct answers
    data2["correct_answers"]["part4_ans"] = i

    # Update the data object with a new dict
    data.update(data2)


def create_data2():

    nested_dict = lambda: defaultdict(nested_dict)
    return nested_dict()
