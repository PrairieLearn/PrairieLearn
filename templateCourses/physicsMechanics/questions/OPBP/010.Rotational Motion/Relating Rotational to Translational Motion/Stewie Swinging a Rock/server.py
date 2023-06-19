from collections import defaultdict

import prairielearn as pl
import sympy as sp


def create_data2():
    nested_dict = lambda: defaultdict(nested_dict)
    return nested_dict()


def generate(data):
    data2 = create_data2()

    # store phrases etc
    data2["params"]["vars"]["title"] = "Swinging a Rock in a Circle"

    # Declare math symbols to be used by sympy
    g, h = sp.symbols("g h")
    r = sp.symbols("r", positive=True)
    # Describe the solution equation
    w = sp.sqrt(2 * g * h) / r

    # Answer to fill in the blank input stored as JSON.
    data2["correct_answers"]["part1_ans"] = pl.to_json(w)

    # Update the data object with a new dict
    data.update(data2)
