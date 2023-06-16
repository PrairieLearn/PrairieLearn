import numpy as np
import numpy.linalg as la
import prairielearn as pl


def generate(data):

    alpha = 1.581

    def obj_func(x, y, s):
        # code for computing the objective function at (x+alpha*s)
        x0 = x + alpha * s[0]
        y0 = y + alpha * s[1]
        return (
            3 + (x0**2) / 8 + (y0**2) / 8 - np.sin(x0) * np.cos(np.sqrt(2) / 2 * y0)
        )

    def gradient(x, y):
        # code for computing gradient
        g1 = 0.25 * x - np.cos(x) * np.cos(np.sqrt(2) / 2 * y)
        g2 = 0.25 * y + np.sin(x) * np.sqrt(2) / 2 * np.sin(np.sqrt(2) / 2 * y)
        return np.array([g1, g2])

    def steepest_descent(x_init):
        s = -1 * gradient(x_init[0], x_init[1])
        x1 = x_init + alpha * s
        return x1

    def hessian(x, y):
        # Computes the hessian matrix corresponding the given objective function
        h1 = 0.25 + np.sin(x) * np.cos(np.sqrt(2) / 2 * y)
        h2 = (
            0.25
            + np.sin(x) * np.cos(np.sqrt(2) / 2 * y) * np.sqrt(2) / 2 * np.sqrt(2) / 2
        )

        h12 = np.sin(np.sqrt(2) / 2 * y) * np.cos(x) * np.sqrt(2) / 2
        h21 = np.sin(np.sqrt(2) / 2 * y) * np.cos(x) * np.sqrt(2) / 2

        return np.array([[h1, h12], [h21, h2]])

    def newtons_method(x_init):
        H = hessian(x_init[0], x_init[1])
        df = gradient(x_init[0], x_init[1])
        s = la.solve(H, -1 * df)
        x1 = x_init + s
        return x1

    x0 = np.array([np.pi / 3, np.pi / (2 * np.sqrt(2))])

    df = gradient(x0[0], x0[1]).reshape((2, 1))
    H = hessian(x0[0], x0[1])

    steepest_iterate = steepest_descent(x0).reshape((2, 1))
    newton_iterate = newtons_method(x0).reshape((2, 1))

    # data["correct_answers"]["newton_iterate"] = np.array([[1.59547, -0.41352]])
    # data["correct_answers"]["steepest_iterate"] = np.array([[1.19226063, -0.01288472]])
    data["params"]["alpha"] = alpha
    data["correct_answers"]["x0"] = pl.to_json(x0 / np.pi)

    data["correct_answers"]["df"] = pl.to_json(df)
    data["correct_answers"]["H"] = pl.to_json(H)

    data["correct_answers"]["newton_iterate"] = pl.to_json(newton_iterate)
    data["correct_answers"]["steepest_iterate"] = pl.to_json(steepest_iterate)

    return data
