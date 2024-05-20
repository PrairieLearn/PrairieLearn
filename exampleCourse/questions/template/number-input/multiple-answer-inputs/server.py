import itertools
import math
import random

import sympy


def generate(data):
    # Select 2 random coefficients between -15 and 15, excluding 0.
    a, b = random.sample(sorted(itertools.chain(range(-15, 0), range(1, 16))), 2)

    # We want to ensure that the polynomial has 2 real roots.
    # To do this, we make sure that the discriminant is positive.
    # Solving `b**2 - 4*a*c > 0` for `c`, we get `c < b**2 / (4 * a)`.
    # Note that the sign of `a` determines the direction of the inequality.
    c_bound = b**2 / (4 * a)
    if a > 0:
        c_bound = math.floor(c_bound)
        c = random.randint(min(-15, c_bound - 15), c_bound)
    else:
        c_bound = math.ceil(c_bound)
        c = random.randint(c_bound, max(15, c_bound + 15))

    # Generate the polynomial.
    x = sympy.symbols("x")
    polynomial = sympy.expand(a * x**2 + b * x + c)

    # Compute the roots of the polynomial.
    roots = [float(root.evalf()) for root in sympy.solve(polynomial, x)]

    data["params"]["polynomial"] = str(sympy.latex(polynomial))
    data["correct_answers"]["smaller_root"] = min(roots)
    data["correct_answers"]["larger_root"] = max(roots)
