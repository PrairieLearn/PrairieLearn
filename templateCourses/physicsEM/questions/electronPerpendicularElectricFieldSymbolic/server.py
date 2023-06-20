import random

import prairielearn as pl
import sympy


def generate(data):

    str1 = " + + + + + + + + + + + + + + "
    str2 = " _  _  _  _  _  _  _  _  _  _  _  _   "

    data["params"]["plus"] = str1
    data["params"]["minus"] = str2

    (m, E, q, v, A, B) = sympy.var("m E q v A B")
    data["params"]["varlist"] = [
        sympy.latex(m),
        sympy.latex(E),
        sympy.latex(q),
        sympy.latex(v),
        sympy.latex(A),
        sympy.latex(B),
    ]

    # Force
    F = q * E  # in the j direction
    data["correct_answers"]["Fi"] = "0"
    data["correct_answers"]["Fj"] = pl.to_json(F)

    # acceleration
    a = F / m  # in the j direction
    data["correct_answers"]["ai"] = "0"
    data["correct_answers"]["aj"] = pl.to_json(a)

    # time
    t = A / v
    data["correct_answers"]["t"] = pl.to_json(t)

    # velocity at end region 1
    v1x = v
    v1y = a * t
    data["correct_answers"]["v1x"] = pl.to_json(v1x)
    data["correct_answers"]["v1y"] = pl.to_json(v1y)

    # displacement at end region 1
    y1 = (a * t**2) / 2
    data["correct_answers"]["y1"] = pl.to_json(y1)

    # displacement at the screen
    tantheta = v1y / v1x
    data["correct_answers"]["tantheta"] = pl.to_json(tantheta)
    y2 = B * tantheta
    yt = y1 + y2
    data["correct_answers"]["yt"] = pl.to_json(yt)
