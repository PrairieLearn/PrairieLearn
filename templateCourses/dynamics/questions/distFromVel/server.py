import random

import numpy as np
from sympy import *


def generate(data):

    t = symbols("t")

    v = Matrix([randPoly(t, 2), randPoly(t, 2)])

    t_value = random.choice([1, 2, 3])

    r = integrate(v, t)

    r_value = r.subs(t, t_value)

    r_answer = float(r_value.norm().evalf())

    data["params"]["v_x"] = latex(v[0])
    data["params"]["v_y"] = latex(v[1])

    # for copyable inputs
    data["params"]["vx"] = str(v[0])
    data["params"]["vy"] = str(v[1])
    data["params"]["t"] = t_value

    data["correct_answers"]["r"] = r_answer

    return data


def randPoly(t, n):

    """t: independent variable
        n: degree of polynomial
    returns a polynomial of degree n
    """

    A_list = [-3, -2, -1, 1, 2, 3]
    B_list = [-3, -2, -1, 0, 1, 2, 3]
    C_list = B_list

    if n == 1:
        y = random.choice(A_list) * t + random.choice(B_list)
    elif n == 2:
        y = (
            random.choice(A_list) * t**2
            + random.choice(B_list) * t
            + random.choice(C_list)
        )

    return y
