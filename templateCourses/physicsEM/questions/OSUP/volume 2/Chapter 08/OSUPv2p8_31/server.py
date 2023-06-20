import random

import numpy as np


def generate(data):

    # define bounds of the variables
    a = random.choice(np.linspace(4, 14, num=11))  # pF
    b = random.choice(np.linspace(4.5, 14.5, num=11))  # pF
    v = random.choice(np.linspace(300, 500, num=21))  # V

    # store the variables in the dictionary "params"
    data["params"]["a"] = "{:.1f}".format(a)
    data["params"]["b"] = "{:.1f}".format(b)
    data["params"]["v"] = "{:.0f}".format(v)

    # fixing units
    a = a * 1e-12  # F
    b = b * 1e-12  # F

    # define correct answers
    Q = ((a * b) / (a + b)) * v  # C
    V_1 = Q / a  # V
    V_2 = Q / b  # V

    # Put the solutions into data['correct_answers']
    data["correct_answers"]["part1_ans"] = round(Q * 1e9, 3)
    data["correct_answers"]["part2_ans"] = round(V_1, 3)
    data["correct_answers"]["part3_ans"] = round(V_2, 3)
