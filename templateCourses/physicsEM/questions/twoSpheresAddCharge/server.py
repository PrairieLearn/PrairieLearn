import random

import sympy


def generate(data):
    k, q, d = sympy.symbols("k q d", positive=True)
    coeff = random.sample(range(1, 5), 2)
    a = random.choice([-1, 1]) * coeff[0]
    b = random.choice([-1, 1]) * coeff[1]
    c = random.choice([-1, 1]) * random.choice(range(1, 5))
    data["params"]["Q1"] = str(a) + "q"
    data["params"]["Q2"] = str(b) + "q"
    data["params"]["Q3"] = str(c) + "q"
    q1 = a * q
    q2 = b * q
    q3 = c * q
    F31 = k * q1 * q3 / d**2
    F32 = k * q2 * q3 / d**2
    Fnet = abs(F31 - F32)
    data["params"]["d"] = sympy.latex(d)
    data["params"]["k"] = sympy.latex(k)
    data["params"]["q"] = sympy.latex(q)
    data["correct_answers"]["Fr"] = str(Fnet)
