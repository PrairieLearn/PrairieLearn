import random, math
import numpy as np
import prairielearn as pl
import scipy.linalg as sla
import to_precision
import sympy

def generate(data):

    # The "x, y =" part is actually optional because the var function
    # injects symbols to the environment, but it should help to inform
    # your IDE or linter.
    x, y = sympy.var('x y')

    A_sol = sympy.Matrix([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]])
    b_sol = sympy.Matrix([[1], [2], [x], [y]])
    data["correct_answers"]["outA"] = pl.to_json(A_sol)
    data["correct_answers"]["outb"] = pl.to_json(b_sol)

    # You can specify placeholders, indexing from _1,
    # and going across rows:
    data["params"]["placeholder"] = {}
    data["params"]["placeholder"]["outA_1"] = "1"
    data["params"]["placeholder"]["outA_2"] = "2"
    data["params"]["placeholder"]["outA_3"] = "3"
    data["params"]["placeholder"]["outA_4"] = "x"
    data["params"]["placeholder"]["outA_5"] = "y"
    data["params"]["placeholder"]["outA_6"] = "x**2"
    data["params"]["placeholder"]["outA_7"] = "0"
    data["params"]["placeholder"]["outA_8"] = "0"
    data["params"]["placeholder"]["outA_9"] = "0"
    data["params"]["placeholder"]["outA_10"] = "0"
    data["params"]["placeholder"]["outA_11"] = "0"
    data["params"]["placeholder"]["outA_12"] = "0"
    data["params"]["placeholder"]["outA_13"] = "0"
    data["params"]["placeholder"]["outA_14"] = "0"
    data["params"]["placeholder"]["outA_15"] = "0"
    data["params"]["placeholder"]["outA_16"] = "0"

    data["params"]["placeholder"]["outb_1"] = "1"
    data["params"]["placeholder"]["outb_2"] = "2"
    data["params"]["placeholder"]["outb_3"] = "3"
    data["params"]["placeholder"]["outb_4"] = "4"

    return data
