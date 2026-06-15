import math
import random

import sympy


def generate(data):
    # We want to pick three random coefficients a, b, and c such that the
    # resulting polynomial has two real roots. We'll loop until we manage
    # to find such coefficients.
    while True:
        a = random.randint(-15, 15)
        b = random.randint(-15, 15)
        c = random.randint(-15, 15)

        if a != 0 and b != 0 and c != 0 and b**2 - 4 * a * c > 0:
            break

    # Use sympy to generate a LaTeX representation of the polynomial for display.
    # This avoids the need to manually handle things like negative signs and
    # coefficients of 1.
    x = sympy.symbols("x")
    data["params"]["polynomial"] = sympy.latex(a * x**2 + b * x + c)

    # Calculate the roots of the polynomial with the quadratic formula.
    smaller_root = (-b - math.sqrt(b**2 - 4 * a * c)) / (2 * a)
    larger_root = (-b + math.sqrt(b**2 - 4 * a * c)) / (2 * a)

    data["correct_answers"]["smaller_root"] = smaller_root
    data["correct_answers"]["larger_root"] = larger_root
