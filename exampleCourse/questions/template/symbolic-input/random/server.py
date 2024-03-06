import numpy as np
import sympy


def generate(data):
    # Create a variable.
    x = sympy.symbols("x")

    # Randomize the degree.
    degree = np.random.random_integers(1, 5)

    # Randomize the coefficients.
    coeffs = np.random.randint(-9, 10, degree + 1)
    # Overwrite the leading coefficient to ensure it's non-zero.
    coeffs[0] = np.random.randint(1, 10)

    # Create the polynomial.
    f = sympy.Poly(coeffs, x).as_expr()

    # Find derivative with respect to x.
    df = sympy.diff(f, x)

    # Store the parameters and correct answer.
    data["params"]["x"] = sympy.latex(x)
    data["params"]["f"] = sympy.latex(f)
    data["correct_answers"]["derivative"] = str(df)
