import random

from pl_random import *
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
