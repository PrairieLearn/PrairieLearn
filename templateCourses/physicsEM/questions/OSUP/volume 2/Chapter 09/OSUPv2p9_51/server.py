import random


def generate(data):

    # define bounds of the variables
    R = random.randint(50, 300)
    V = round(random.uniform(1, 5), 1)
    p = random.randint(1, 10)
    Vtotal = 2 * V

    # store the variables in the dictionary "params"
    data["params"]["R"] = R
    data["params"]["V"] = V
    data["params"]["p"] = p
    data["params"]["Vtotal"] = Vtotal

    # compute the solution
    R_min = ((100 - p) / 100) * R * 1e3  # Ohms
    R_max = ((100 + p) / 100) * R * 1e3  # Ohms
    I_max = (Vtotal / R_min) * 1e6  # muA
    I_min = (Vtotal / R_max) * 1e6  # muA

    # Put the solutions into data['correct_answers']
    data["correct_answers"]["part1_ans"] = I_min
    data["correct_answers"]["part2_ans"] = I_max
