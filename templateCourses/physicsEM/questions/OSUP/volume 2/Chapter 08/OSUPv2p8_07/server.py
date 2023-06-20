import random
from collections import defaultdict

import numpy as np

nested_dict = lambda: defaultdict(nested_dict)


def generate(data):
    data2 = nested_dict()

    # define bounds of the variables
    c = random.choice(np.linspace(1, 3, num=21))  # muF
    n = random.choice(np.linspace(3, 7, num=5))  # number of capacitors

    # store the variables in the dictionary "params"
    data2["params"]["c"] = "{:.1f}".format(c)

    if n == 3:
        data2["params"]["n"] = "three"
    elif n == 4:
        data2["params"]["n"] = "four"
    elif n == 5:
        data2["params"]["n"] = "five"
    elif n == 6:
        data2["params"]["n"] = "six"
    elif n == 7:
        data2["params"]["n"] = "seven"

    # calculate correct answer for part 1
    A = n * c

    # define correct answer for part 1
    data2["correct_answers"]["part1_ans"] = A

    # calculate correct answer for part 2
    B = c / n

    # define correct answer for part 2
    data2["correct_answers"]["part2_ans"] = B

    data.update(data2)
