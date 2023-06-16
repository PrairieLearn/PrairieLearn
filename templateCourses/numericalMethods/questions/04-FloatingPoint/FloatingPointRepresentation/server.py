import random

import numpy as np


def generate(data):

    ndigits = random.choice([6, 7])
    a0 = [1]
    a1 = np.random.choice([0, 1], size=(ndigits - 2,))
    a = np.append(np.append(a0, a1), [1])
    f = "".join(np.char.mod("%d", a))

    sum = 0
    for i, value in enumerate(a):
        sum += value * 2.0 ** (-(i + 1))

    m = ndigits - 2

    decimalNumber = (1 + sum) * 2 ** (m)
    # print("decimal number is = ",decimalNumber)

    mv = random.randint(1, m)
    if mv == m:
        binSign = "1." + f
    else:
        binSign = "1" + f[: (m - mv)] + "." + f[(m - mv) :]

    data["params"]["mv"] = mv
    data["params"]["ndec"] = decimalNumber

    data["correct_answers"]["g"] = binSign


def grade(data):
    if data["score"] != 1.0:
        feedback = "You may consider converting the number into binary at first."
    else:
        feedback = ""

    data["feedback"]["question_feedback"] = feedback
