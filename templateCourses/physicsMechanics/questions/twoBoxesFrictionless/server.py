import random

import sympy


def generate(data):
    (m1, m2, m, F, T) = sympy.var("m1 m2 m F T")
    alpha = random.randint(2, 5)

    if random.choice([0, 1]):
        m1 = alpha * m
        m2 = m
    else:
        m2 = alpha * m
        m1 = m

    T = m1 * F / (m1 + m2)

    data["params"]["m1"] = sympy.latex(m1)
    data["params"]["m2"] = sympy.latex(m2)
    data["params"]["F"] = sympy.latex(F)
    data["correct_answers"]["T"] = str(T)
