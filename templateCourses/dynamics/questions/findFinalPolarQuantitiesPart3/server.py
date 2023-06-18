import random

import numpy as np
import prairielearn as pl
from sympy import *


def rationalize_coeffs(expr):
    for i in expr.atoms(Float):
        r = Rational(str(i)).limit_denominator(1000)
        expr = expr.subs(i, r)
    return expr


def generate(data):

    r0 = random.choice([4, 5, 6, 7, 2, 9])
    theta0 = random.choice([1, 2, 3, 4])
    theta0 *= random.choice([-1, 1])
    t_val = random.choice([1, 2, 3, 4])
    t, C = symbols("t C")
    # 0 is when ethetahat is 0
    # 1 is when erhat is 0
    # 2 is when both are given
    basis_choice = random.choice([0, 1, 2])

    if basis_choice == 2:

        ercomp, ethcomp = random.choice(
            [(1, 1), (1, -1), [1, 2], [2, 4], [3, 6], [4, 8], [5, 10]]
        )

        rdot = int(ercomp)
        r_expr = integrate(rdot, t)

        C1 = r0 - int(r_expr.subs(t, 0).evalf())

        r_expr = r_expr + C1

        C2_val = int(theta0) - int(ethcomp / ercomp) * log(C1)
        theta_expr = int(ethcomp / ercomp) * log(int(ercomp) * t + int(C1)) + C
        rf = float(r_expr.subs(t, t_val).evalf())
        thetaf = float((theta_expr.subs(t, t_val).subs(C, C2_val)).evalf())

    elif basis_choice == 1:
        ercomp = random.choice([cos(2 * t), sin(2 * t), cos(t), sin(t), 2 * sin(t)])
        ethcomp = 0
        C2_val = int(theta0)
        rdot = ercomp
        r_expr = integrate(rdot, t)
        C1 = int(r0) - r_expr.subs(t, 0).evalf()

        r_expr = r_expr + C1
        r_expr = rationalize_coeffs(r_expr)
        theta_expr = C
        rf = float(r_expr.subs(t, t_val).evalf())
        thetaf = float(theta0)
        ercomp = f"({latex(ercomp)})"

    else:
        r0 = 2
        ercomp = 0
        # ethcomp = random.choice([0,1,2,3,4])

        ethcomp = random.choice([cos(2 * t), sin(2 * t), cos(t), sin(t), 2 * sin(t)])

        rf = r0
        r_expr = r0
        thetadot = ethcomp / r0
        C1 = r0
        theta_expr = integrate(thetadot, t) + C
        theta_expr = rationalize_coeffs(theta_expr)
        theta_prop = integrate(thetadot, t)
        C2_val = float(theta0 - float(theta_prop.subs(t, 0).evalf()))

        thetaf = float(theta_expr.subs(t, t_val).subs(C, C2_val).evalf())
        ethcomp = f"({latex(ethcomp)})"

    v = np.array([ercomp, ethcomp, 0])
    # data['params']['ercomp'] = ercomp
    # data['params']['ethcomp'] = ethcomp
    data["params"]["v"] = polarVector(v)
    data["params"]["r0"] = r0
    data["params"]["theta0"] = theta0
    data["params"]["t"] = t_val

    data["correct_answers"]["r"] = pl.to_json(sympify(r_expr))
    data["correct_answers"]["theta"] = pl.to_json(sympify(theta_expr))
    data["correct_answers"]["C2"] = float(C2_val)
    data["correct_answers"]["rf"] = rf
    data["correct_answers"]["thetaf"] = thetaf

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
