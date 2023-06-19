import math
import random
from collections import defaultdict

import pandas as pd


def create_data2():
    nested_dict = lambda: defaultdict(nested_dict)
    return nested_dict()


def generate(data):
    data2 = create_data2()

    # define or load names/items/objects
    vehicles = pd.read_csv(
        "https://raw.githubusercontent.com/open-resources/problem_bank_helpers/main/data/vehicles.csv"
    )["Vehicles"].tolist()

    # store phrases etc
    data2["params"]["vars"]["vehicle"] = random.choice(vehicles)
    data2["params"]["vars"]["title"] = "A Crate's Maximum Acceleration without Slipping"
    data2["params"]["vars"]["units"] = "$m/s^2$"

    # define bounds of the variables
    mu_k = round(random.uniform(0.2, 0.5), 2)
    mu_s = round(random.uniform(mu_k + 0.1, 1.0), 2)
    theta = random.randint(10, 30)

    # store the variables in the dictionary "params"
    data2["params"]["mu_s"] = mu_s
    data2["params"]["mu_k"] = mu_k
    data2["params"]["theta"] = theta

    # define g
    g = 9.81

    # calculate a_max
    theta_r = math.radians(theta)  # convert to radians
    a_max = g * (mu_s * math.cos(theta_r) - math.sin(theta_r))

    # define correct answers
    data2["correct_answers"]["part1_ans"] = a_max

    # Update the data object with a new dict
    data.update(data2)
