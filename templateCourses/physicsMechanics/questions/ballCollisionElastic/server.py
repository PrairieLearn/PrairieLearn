import random

import sympy


def generate(data):
    (v, m) = sympy.var("v m")
    ratio = random.randint(2, 5)
    data["params"]["ratio"] = ratio

    vf = v / ratio
    M = m * (v - vf) ** 2 / (v**2 - vf**2)

    data["correct_answers"]["M"] = str(M)
