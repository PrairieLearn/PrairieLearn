import random

import numpy as np


def generate(data):

    # define bounds of the variables
    P = round(random.uniform(0, 2), 2)
    R = random.randint(1, 100)

    # store the variables in the dictionary "params"
    data["params"]["P"] = P
    data["params"]["R"] = R

    # calculating correct answer
    V = np.sqrt(P * R * 1e3)

    # define correct answers
    data["correct_answers"]["part1_ans"] = V
