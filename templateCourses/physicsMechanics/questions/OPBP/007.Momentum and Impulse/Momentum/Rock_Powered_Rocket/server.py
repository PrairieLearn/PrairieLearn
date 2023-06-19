import random
from collections import defaultdict

import pandas as pd


def create_data2():
    nested_dict = lambda: defaultdict(nested_dict)
    return nested_dict()


def generate(data):
    data2 = create_data2()

    # define or load names/items/objects from server files
    names = pd.read_csv(
        "https://raw.githubusercontent.com/open-resources/problem_bank_helpers/main/data/names.csv"
    )["Names"].tolist()
    name = random.choice(names)

    # store phrases etc
    data2["params"]["vars"]["title"] = "Rock Powered Rocket"
    data2["params"]["vars"]["units1"] = "m/s"
    data2["params"]["vars"]["units2"] = "kg"
    data2["params"]["vars"]["name"] = name

    # define bounds of the variables
    i = random.randint(300, 400)
    m = random.randint(20, 40)
    v_1 = random.randint(5, 30)
    v_2 = v_1 + random.randint(2, 25)

    # store the variables in the dictionary "params"
    data2["params"]["i"] = i
    data2["params"]["m"] = m
    data2["params"]["v_1"] = v_1
    data2["params"]["v_2"] = v_2

    ## Part 1

    # define correct answers
    data2["correct_answers"]["part1_ans"] = 0

    ## Part 2

    # define correct answers
    data2["correct_answers"]["part2_ans"] = (-((m + i) * v_1)) / m

    ## Part 3

    # define correct answers
    data2["correct_answers"]["part3_ans"] = (((m + i) * v_1) - (i * v_2)) / m

    # Update the data object with a new dict
    data.update(data2)
