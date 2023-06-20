import random


def generate(data):

    # define bounds of the variables
    c = round(random.uniform(0, 1), 2)
    h = random.randint(2, 24)

    # store the variables in the dictionary "params"
    data["params"]["c"] = c
    data["params"]["h"] = h

    # constants
    P = 16e-3  # kW

    # calculate the correct
    E = P * 365 * h
    C = E * c

    # define correct answers
    data["correct_answers"]["part1_ans"] = C
