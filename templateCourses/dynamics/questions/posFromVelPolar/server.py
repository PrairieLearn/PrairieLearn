import random

import numpy as np
from sympy import *


def generate(data):
    t = symbols("t")

    int_list = [-3, -2, -1, 1, 2, 3]

    basis_choice = random.choice(["\\hat{e}_r", "\\hat{e}_{\\theta}"])

    if basis_choice == "\\hat{e}_r":
        num = random.choice([True, False])
        if num:
            ercomp = random.choice(int_list)
            ethcomp = random.choice(int_list)

            x0 = random.choice([-1, 1]) * random.randint(10, 15)
            y0 = random.choice([-1, 1]) * random.randint(10, 15)
            t_value = random.randint(2, 3)
            r0 = sqrt(x0**2 + y0**2)
            theta0 = np.arctan2(y0, x0)

            rdot = ercomp
            r_expr = integrate(rdot, t)

            C1 = float(r0 - float(r_expr.subs(t, 0).evalf()))

            r = r_expr + C1

            C2 = float(theta0 - ethcomp / ercomp * log(C1))

            theta_t_value = ethcomp / ercomp * log(ercomp * t_value + C1) + C2

            x = r.subs(t, t_value) * cos(theta_t_value)
            y = r.subs(t, t_value) * sin(theta_t_value)
        else:
            ercomp = random.choice([randTrig(t), randPoly(t, 2)])
            ethcomp = 0

            x0 = random.choice([-1, 1]) * random.randint(6, 12)
            y0 = random.choice([-1, 1]) * random.randint(6, 12)
            t_value = random.randint(2, 5)
            r0 = sqrt(x0**2 + y0**2)
            theta0 = np.arctan2(y0, x0)

            rdot = ercomp
            r_expr = integrate(rdot, t)
            C = float(r0 - float(r_expr.subs(t, 0).evalf()))
            r = r_expr + C

            theta = theta0

            x = r.subs(t, t_value) * cos(theta)
            y = r.subs(t, t_value) * sin(theta)

            ercomp = f"({latex(ercomp)})"
    else:
        num = random.choice([True, False])
        if num:
            ercomp = random.choice(int_list)
            ethcomp = random.choice(int_list)
            x0 = random.choice([-1, 1]) * random.randint(10, 15)
            y0 = random.choice([-1, 1]) * random.randint(10, 15)
            t_value = random.randint(2, 3)
            r0 = sqrt(x0**2 + y0**2)
            theta0 = np.arctan2(y0, x0)

            rdot = ercomp
            r_expr = integrate(rdot, t)

            C1 = float(r0 - float(r_expr.subs(t, 0).evalf()))

            r = r_expr + C1

            C2 = float(theta0 - ethcomp / ercomp * log(C1))

            theta_t_value = ethcomp / ercomp * log(ercomp * t_value + C1) + C2

            x = r.subs(t, t_value) * cos(theta_t_value)
            y = r.subs(t, t_value) * sin(theta_t_value)
        else:
            ercomp = 0
            ethcomp = random.choice([randTrig(t), randPoly(t, 2), randExp(t)])

            x0 = random.choice([-1, 1]) * random.randint(2, 5)
            y0 = random.choice([-1, 1]) * random.randint(2, 5)
            t_value = random.randint(2, 5)
            r0 = sqrt(x0**2 + y0**2)
            theta0 = np.arctan2(y0, x0)

            r = r0

            thetadot = ethcomp / r

            theta_expr = integrate(thetadot, t)

            C = float(theta0 - float(theta_expr.subs(t, 0).evalf()))

            theta = theta_expr + C

            x = r * cos(theta.subs(t, t_value))
            y = r * sin(theta.subs(t, t_value))

            ethcomp = f"({latex(ethcomp)})"

    v = np.array([ercomp, ethcomp, 0])

    data["params"]["v"] = polarVector(v)
    data["params"]["x0"] = float(x0)
    data["params"]["y0"] = float(y0)
    data["params"]["t"] = t_value

    data["correct_answers"]["x"] = float(x)
    data["correct_answers"]["y"] = float(y)

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


def randTrig(t):
    A_list = [-3, -2, -1, 1, 2, 3]
    trig_type = random.choice(["sin", "cos"])
    if trig_type == "sin":
        f = random.choice(A_list) * sin(random.choice(A_list) * t)
    else:
        f = random.choice(A_list) * cos(random.choice(A_list) * t)

    return f


def randExp(t):
    A_list = [-3, -2, -1, 1, 2, 3]

    return random.choice(A_list) * exp(random.choice(A_list) * t)


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


def polarVector(v):
    return vectorInBasis(v, "\\hat{e}_r", "\\hat{e}_{\\theta}", "\\hat{k}")
