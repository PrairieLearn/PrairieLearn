import random


def generate(data):

    # define bounds of the variables
    R = random.randint(50, 300)
    I = random.randint(0, 100)

    # store the variables in the dictionary "params"
    data["params"]["R"] = R
    data["params"]["I"] = I

    # calculate the correct
    V = I * 1e-3 * R

    # define correct answers
    data["correct_answers"]["part1_ans"] = round(V, 2)
