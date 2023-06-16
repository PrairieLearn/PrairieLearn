import random

import numpy as np


def generate(data):
    f, x0 = None, None
    case = random.choice([2, 3])
    data["params"]["case"] = int(case)
    data["params"]["tol"] = 1e-12

    if case == 0:
        f = """
            $$
                f(x) = -(16x^2 - 24x + 5) \\cdot e^{-x}
            $$
        """
        x0 = np.random.uniform(3, 3.5)
    elif case == 1:
        f = """
            $$
                f(x) = -x^{2/3} - (1 - x^2)^{1/3}
            $$
        """
        x0 = np.random.uniform(0.001, 0.99)
    elif case == 2:
        f = """
            $$
                f(x) = -e^{-x^2} \\cdot (x + \\sin(x))
            $$
        """
        x0 = np.random.uniform(0.75, 1.0)
    elif case == 3:
        f = """
            $$
                f(x) = \\frac{x^2 - 5x + 6}{x^2 + 1}
            $$
        """
        x0 = np.random.uniform(0.5, 1)

    data["params"]["f"] = f
    data["params"]["x0"] = x0

    names_for_user = [
        {"name": "x0", "description": "Initial guess", "type": "float"},
        {"name": "tol", "description": "Tolerance threshold value", "type": "float"},
    ]
    names_from_user = [
        {"name": "dfunc", "description": "Evaluates $f'(x)$", "type": "function"},
        {"name": "d2func", "description": "Evaluates $f''(x)$", "type": "function"},
        {
            "name": "newton_guesses",
            "description": "Array holding the guesses from Newton's Method",
            "type": "1D numpy array",
        },
    ]
    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user
    return data
