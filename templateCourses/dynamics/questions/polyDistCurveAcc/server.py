import random
from sympy import *


def generate(data):
    t = symbols("t")

    s = randPoly(t, 2)

    t_value = random.randint(1, 3)

    rho = random.randint(2, 10)

    sdot = diff(s, t).subs(t, t_value)
    sddot = diff(s, t, 2).subs(t, t_value)

    a = sqrt(sddot**2 + (sdot**2 / rho) ** 2).evalf()

    data["params"]["slatex"] = latex(s)
    data["params"]["s"] = str(s)
    data["params"]["t"] = t_value
    data["params"]["rho"] = rho
    data["correct_answers"]["a"] = float(a)

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
