import random
from sympy import *


def generate(data):

    t = symbols("t")

    en = Matrix([0, 0])

    r = Matrix([0, 0])

    t_v = random.randint(1, 3)

    while en.norm() == nan or en.norm() == 0:
        r = Matrix(
            [randPoly(t, random.randint(1, 2)), randPoly(t, random.randint(1, 2)), 0]
        )

        v = diff(r, t).subs(t, t_v)

        a = diff(r, t, 2).subs(t, t_v)

        en = (a - a.project(v)) / (a - a.project(v)).norm()

        rho = v.norm() ** 3 / (v.cross(a)).norm()

        C = r.subs(t, t_v) + rho * en

    data["params"]["r_x"] = latex(r[0])
    data["params"]["r_y"] = latex(r[1])
    data["params"]["rx"] = str(r[0])
    data["params"]["ry"] = str(r[1])
    data["params"]["t"] = t_v

    data["correct_answers"]["Cx"] = float(C[0])
    data["correct_answers"]["Cy"] = float(C[1])

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
