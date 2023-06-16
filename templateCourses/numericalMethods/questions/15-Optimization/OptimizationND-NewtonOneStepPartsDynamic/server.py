import numpy as np
import numpy.linalg as la
import prairielearn as pl
from sympy import cos, diff, exp, latex, sin, var


def generate(data):

    coeffs = np.random.randint(2, 15, size=(6,))

    def func():
        x, y = var("x y")
        f = (
            coeffs[0] * x**2
            + coeffs[0] * y**2
            + coeffs[1] * x * y
            + coeffs[2] * exp(coeffs[3] * x * y)
            + coeffs[4] * sin(y) ** 2
            + coeffs[5] * cos(x * y)
        )
        return f, x, y

    def gradient(x, y):
        f, x0, y0 = func()
        g1 = diff(f, x0).evalf(subs={x0: x, y0: y})
        g2 = diff(f, y0).evalf(subs={x0: x, y0: y})
        return np.array([g1, g2]).astype(np.float)

    def steepest_descent_direction(x_init):
        s = -1 * gradient(x_init[0], x_init[1])
        return s

    def hessian(x, y):
        f, x0, y0 = func()

        h11 = diff(f, x0, x0).evalf(subs={x0: x, y0: y})
        h12 = diff(f, x0, y0).evalf(subs={x0: x, y0: y})
        h21 = diff(f, y0, x0).evalf(subs={x0: x, y0: y})
        h22 = diff(f, y0, y0).evalf(subs={x0: x, y0: y})
        return np.array([[h11, h12], [h21, h22]]).astype(np.float)

    def newtons_method(x_init):
        H = hessian(x_init[0], x_init[1])
        df = gradient(x_init[0], x_init[1])
        s = la.solve(H, -1 * df)
        x1 = x_init + s
        return x1

    # starting point
    np.random.seed(9)
    r0 = np.random.randint(-5, 6, size=(2,))

    df = gradient(r0[0], r0[1]).reshape((2, 1))
    H = hessian(r0[0], r0[1])

    steepest_direction = steepest_descent_direction(r0).reshape((2, 1))
    newton_iterate = newtons_method(r0).reshape((2, 1))

    data["params"]["func_string"] = latex(func()[0])

    data["params"]["x0"] = str(r0[0])
    data["params"]["y0"] = str(r0[1])

    data["correct_answers"]["df"] = pl.to_json(df)
    data["correct_answers"]["H"] = pl.to_json(H)

    data["correct_answers"]["newton_iterate"] = pl.to_json(newton_iterate)
    data["correct_answers"]["steepest_direction"] = pl.to_json(steepest_direction)

    return data
