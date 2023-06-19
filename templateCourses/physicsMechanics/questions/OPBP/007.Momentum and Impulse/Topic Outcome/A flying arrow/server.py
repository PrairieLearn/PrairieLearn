import random as rd
from collections import defaultdict

import pandas as pd


def create_data2():
    nested_dict = lambda: defaultdict(nested_dict)
    return nested_dict()


def generate(data):
    data2 = create_data2()

    # define or load names/items/objects
    names = pd.read_csv(
        "https://raw.githubusercontent.com/open-resources/problem_bank_helpers/main/data/names.csv"
    )["Names"].tolist()
    name1 = rd.choice(names)
    names.remove(name1)
    name2 = rd.choice(names)

    # store phrases etc
    data2["params"]["vars"]["name1"] = name1
    data2["params"]["vars"]["name2"] = name2
    data2["params"]["vars"]["title"] = "A Flying Arrow"
    data2["params"]["vars"]["unit1"] = "$kg\cdot m/s$"
    data2["params"]["vars"]["unit2"] = "$J$"
    data2["params"]["vars"]["unit3"] = "$m/s$"

    # sign of arrow's velocity
    signs = [-1, 1]
    sign = rd.choice(signs)

    # define bounds of the variables
    m = round(rd.uniform(0.10, 0.50), 3)
    v_x = sign * round(rd.uniform(70, 120), 1)
    x1 = round(rd.uniform(5, 25), 1)
    x2 = round(rd.uniform(5, 25), 1)

    # store the variables in the dictionary "params"
    data2["params"]["m"] = m
    data2["params"]["v_x"] = v_x
    data2["params"]["x1"] = x1
    data2["params"]["x2"] = x2

    ## Part 1

    # define correct answers
    data2["correct_answers"]["part1_ans"] = v_x * m

    ## Part 2
    # define correct answers
    data2["correct_answers"]["part2_ans"] = 0.5 * m * (v_x) ** 2

    ## Part 3

    # define correct answers
    ans3 = v_x - x2
    data2["correct_answers"]["part3_ans"] = ans3

    ## Part 4
    # define correct answers
    data2["correct_answers"]["part4_ans"] = m * ans3

    ## Part 5
    # define correct answers
    data2["correct_answers"]["part5_ans"] = 0.5 * m * ans3**2

    # Update the data object with a new dict
    data.update(data2)
