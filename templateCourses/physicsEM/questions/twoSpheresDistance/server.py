import random

import sympy


def generate(data):
    (F) = sympy.var("F")
    coeff = random.sample(range(1, 5), 2)
    a = random.choice([-1, 1]) * coeff[0]
    b = random.choice([-1, 1]) * coeff[1]
    Q1 = str(a) + "Q"
    Q2 = str(b) + "Q"
    data["params"]["Q1"] = Q1
    data["params"]["Q2"] = Q2

    Fr = F * (b + a) ** 2 / (4 * abs(a) * abs(b))
    data["params"]["F"] = sympy.latex(F)
    data["correct_answers"]["Fr"] = str(Fr)
