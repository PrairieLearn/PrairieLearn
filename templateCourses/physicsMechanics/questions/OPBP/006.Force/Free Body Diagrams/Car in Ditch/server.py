import random
from collections import defaultdict

import numpy as np


def generate(data):
    data2 = create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "Car in a Ditch"
    data2["params"]["vars"]["units"] = r"$\rm{N}$"

    # define bounds of the variables
    F = 100 * (
        10 * random.randint(2, 8) + 5 * random.randint(0, 1)
    )  # So that the force is a multiple of 500, from 2000-8500 N

    # store the variables in the dictionary "params"
    data2["params"]["F"] = F

    # define correct answers
    data2["correct_answers"]["part1_ans"] = F / (2 * np.sin(np.deg2rad(5)))

    # Update the data object with a new dict
    data.update(data2)


def create_data2():

    nested_dict = lambda: defaultdict(nested_dict)
    return nested_dict()
