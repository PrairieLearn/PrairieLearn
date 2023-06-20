import random

import numpy as np


def generate(data):

    # define bounds of the variables
    B = round(random.uniform(0.01, 1), 3)
    E = round(random.uniform(0.1, 3), 1)
    r = round(random.uniform(1, 3), 2)

    # store the variables in the dictionary "params"
    data["params"]["B"] = B
    data["params"]["E"] = E
    data["params"]["r"] = r

    # calculating correct answer
    v = (E * 1e4) / B
    ratio = v / (B * r * 1e-3)

    # define correct answers
    data["correct_answers"]["part1_ans"] = ratio
