import random
import numpy as np
import prairielearn as pl
from sympy import *


def generate(data):
    t = symbols("t")
    x0, y0 = random.choice([(3, 4), (4, 3), (15, 8), (8, 15), (5, 12), (12, 5)])

    x0 *= random.choice([-1, 1])
    y0 *= random.choice([-1, 1])

    t_value = random.randint(2, 5)
    r0 = sqrt(x0**2 + y0**2)
    theta0 = np.arctan2(y0, x0)

    ercomp = random.choice([2, 3, 4, 5])
    ercomp *= random.choice([-1, 1])
    ethcomp = 0

    r_expr = integrate(ercomp, t)

    C1 = float(r0 - float(r_expr.subs(t, 0).evalf()))

    r = r_expr + C1

    t_value = random.randint(2, 3)

    r_f = r.subs(t, t_value)

    v = np.array([ercomp, ethcomp, 0])
    data["params"]["v"] = polarVector(v)
    data["params"]["x0"] = int(x0)
    data["params"]["y0"] = int(y0)
    data["params"]["tf"] = int(t_value)

    data["correct_answers"]["xf"] = float(cos(theta0) * r_f)
    data["correct_answers"]["yf"] = float(sin(theta0) * r_f)

    r_f, theta_f = symbols("r_f theta_f")

    x_f = r_f * cos(theta_f)
    y_f = r_f * sin(theta_f)

    data["correct_answers"]["symbolic_x_f"] = pl.to_json(x_f)
    data["correct_answers"]["symbolic_y_f"] = pl.to_json(y_f)

    return data

def polarVector(v):
    return vectorInBasis(v, "\\hat{e}_r", "\\hat{e}_{\\theta}", "\\hat{k}")

def vectorInBasis(v, basis1, basis2, basis3):
    """v: numpy array of size (3,)
    basis1: first basis vector
    basis2: second basis vector
    basis3: third basis vector, default ""
    """

    basis_list = [basis1, basis2, basis3]
    s = []
    e = 0
    v = v.tolist()
    for i in range(len(v)):
        if type(v[i]) == float:
            if v[i] == int(v[i]):
                v[i] = int(v[i])
        e = str(v[i])
        if e == "0":
            continue
        if e == "1" and basis_list[i] != "":
            e = ""
        if e == "-1" and basis_list[i] != "":
            e = "-"
        e += basis_list[i]
        if len(s) > 0 and e[0] != "-":
            e = "+" + e
        s.append(e)
    if len(s) == 0:
        s.append("0")
    return "".join(s)