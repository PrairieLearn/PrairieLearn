import random as rd
from collections import defaultdict

import sympy as sp


def create_data2():
    nested_dict = lambda: defaultdict(nested_dict)
    return nested_dict()


def generate(data):
    data2 = create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "Equilibrium Length of a Spring"
    data2["params"]["vars"]["units"] = "J"

    # define the variable x
    x = sp.Symbol("x")

    # Generate coefficients.
    # For simplicity, we limit ourselves to quadratic functions
    # To obtain a positive answer for the length, we need the coefficients of x^2 and x to be of opposite signs
    a = rd.randint(1, 20)  # coefficient of x^2
    b = rd.randint(-20, -1)  # coefficient of x
    c = rd.randint(-100, 100)  # constant

    # Generate expression for U(x)
    Ux = a * x**2 + b * x + c

    str_Ux = "$" + str(Ux).replace("**", "^") + "$"

    # store the expression in the dictionary "params"
    data2["params"]["Ux"] = str_Ux.replace("*", "")

    # Find the force.  F = - (dU/dx)
    F = (-1) * sp.diff(Ux)

    # Solve for x.  Returns a list.
    ans = sp.solve(F, x)

    # define correct answers
    # answer type: float
    data2["correct_answers"]["part1_ans"] = float(ans.pop(0))

    # Update the data object with a new dict
    data.update(data2)
