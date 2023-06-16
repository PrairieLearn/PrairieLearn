import random

import numpy as np


def generate(data):
    choices = list(range(3, 10))
    exp1 = random.choice(choices)
    choices.remove(exp1)
    exp2 = random.choice(choices)
    coeff2 = np.random.randint(2, 15)

    data["params"]["exp1"] = exp1
    data["params"]["exp2"] = exp2
    data["params"]["coeff2"] = coeff2

    data["correct_answers"]["alpha"] = min(exp1, exp2)
    return data


def grade(data):
    if data["score"] != 1.0:
        feedback = "To find the exponent $\\alpha$, we need to find the exponent corresponding to the term that will result in the largest number. Note that $0 < h < 1$. Do values in this range grow larger or smaller more rapidly the larger the exponent?"
    else:
        feedback = ""
    data["feedback"]["question_feedback"] = feedback
