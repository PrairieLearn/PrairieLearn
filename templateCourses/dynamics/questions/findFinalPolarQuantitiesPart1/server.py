import random

import numpy as np
import prairielearn as pl
import sympy as sp


def generate(data):
    t, C = sp.symbols("t, C")

    t_value = random.randint(2, 5)
    r0 = random.choice([3, 4, 5, 6, 7, 8, 9])
    theta0 = random.choice([2, 3, 4, 6])

    ercomp = random.choice([2, 3, 4, 5])
    ercomp *= random.choice([-1, 1])
    ethcomp = 0

    r_expr_with_C = ercomp * t + C
    r_expr = sp.integrate(ercomp, t)

    C1 = float(r0 - float(r_expr.subs(t, 0).evalf()))

    t_value = random.randint(2, 3)

    r = r_expr + C1
    r_f = r.subs(t, t_value)

    v = np.array([ercomp, ethcomp, 0])

    data["params"]["v"] = polarVector(v)
    data["params"]["t"] = t_value
    data["params"]["r0"] = r0
    data["params"]["theta0"] = theta0

    data["correct_answers"]["symbolic_r"] = pl.to_json(r_expr_with_C)
    data["correct_answers"]["rdot"] = float(ercomp)
    data["correct_answers"]["eth_comp"] = float(ethcomp)
    data["correct_answers"]["final_r"] = pl.to_json(ercomp * t + int(C1))
    data["correct_answers"]["r_0"] = float(r0)
    data["correct_answers"]["r_f"] = float(r_f)
    data["correct_answers"]["theta_f"] = np.pi / theta0

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
