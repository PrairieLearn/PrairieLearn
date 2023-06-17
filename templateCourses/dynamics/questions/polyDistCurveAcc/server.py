import random

from pl_random import *
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
