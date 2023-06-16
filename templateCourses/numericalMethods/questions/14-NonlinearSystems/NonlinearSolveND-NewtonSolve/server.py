import random

import numpy as np
import numpy.linalg as la
import prairielearn as pl


def generate(data):
    # Make a random quadratic function
    coeffs1 = np.random.randint(-3, 4, size=6, dtype=np.int32)
    a1, b1, c1, d1, e1, f1 = coeffs1

    coeffs2 = np.random.randint(-3, 4, size=6, dtype=np.int32)
    a2, b2, c2, d2, e2, f2 = coeffs2

    # Check if all of the nonconstant terms are 0 (Jacobian will be singular, regardless of x0,y0)
    # Regenerate some coefficients (guaranteed not to be 0)
    if np.count_nonzero(np.array([a1, b1, d1, e1, f1])) == 0:
        # Chose a few to generate as nonzero
        a1, e1, f1 = np.random.randint(1, 4, size=3, dtype=np.int32) * np.random.choice(
            np.array([-1, 1], dtype=np.int32), size=3
        )
    if np.count_nonzero(np.array([a2, b2, d2, e2, f2])) == 0:
        # Chose a few to generate as nonzero
        b2, d2, f2 = np.random.randint(1, 4, size=3, dtype=np.int32) * np.random.choice(
            np.array([-1, 1], dtype=np.int32), size=3
        )

    def func1(x, y):
        return a1 * x**2 + b1 * x + c1 + d1 * y**2 + e1 * y + f1 * x * y

    def func2(x, y):
        return a2 * x**2 + b2 * x + c2 + d2 * y**2 + e2 * y + f2 * x * y

    # Partial derivatives
    def df1dx(x, y):
        return 2 * a1 * x + b1 + f1 * y

    def df1dy(x, y):
        return 2 * d1 * y + e1 + f1 * x

    def df2dx(x, y):
        return 2 * a2 * x + b2 + f2 * y

    def df2dy(x, y):
        return 2 * d2 * y + e2 + f2 * x

    def computeJac(x, y):
        jacobian = np.array([[df1dx(x, y), df1dy(x, y)], [df2dx(x, y), df2dy(x, y)]])
        return jacobian

    def computef(x, y):
        return np.array([func1(x, y), func2(x, y)])

    x0, y0 = random.sample(list(range(-2, 3)), 2)
    func = computef(x0, y0)
    jac = computeJac(x0, y0)

    determinant = jac[0, 0] * jac[1, 1] - jac[0, 1] * jac[1, 0]

    # If jacobian is singular, compute new initial values
    while determinant == 0:
        x0, y0 = random.sample(list(range(-2, 3)), 2)
        jac = computeJac(x0, y0)
        func = computef(x0, y0)
        determinant = jac[0, 0] * jac[1, 1] - jac[0, 1] * jac[1, 0]

    # Find step size by solving then add to current point
    iterate = np.array([x0, y0]) + la.solve(jac, -1 * func)

    coeffs = np.zeros((2, 6), dtype=np.int32)
    coeffs[0, :] = coeffs1
    coeffs[1, :] = coeffs2

    data["params"]["x"] = str(x0)
    data["params"]["y"] = str(y0)
    data["params"]["coeffs"] = pl.to_json(coeffs)

    data["correct_answers"]["jac"] = pl.to_json(jac)
    data["correct_answers"]["iterate"] = pl.to_json(iterate.reshape((2, 1)))
    return data
