import numpy as np


def newton_step(x, f, df):
    return x - f(x) / df(x)


x = None
dfunc, d2func = None, None
case = data["params"]["case"]
if case == 0:
    dfunc = lambda x: (24 - 32 * x) * np.exp(-x) + (16 * x**2 - 24 * x + 5) * np.exp(
        -x
    )
    d2func = (
        lambda x: (-24 + 32 * x) * np.exp(-x)
        + (32 * x - 24) * np.exp(-x)
        - (16 * x**2 - 24 * x + 5) * np.exp(-x)
        - 32 * np.exp(-x)
    )
    x = np.linspace(1.9, 3.9, 100)
elif case == 1:
    dfunc = lambda x: -(2 / 3) * x ** (-1 / 3) + (2 / 3) * x * (1 - x**2) ** (-2 / 3)
    d2func = (
        lambda x: (2 / 9) * x ** (-4 / 3)
        + (8 / 9) * x**2 * (1 - x**2) ** (-5 / 3)
        + (2 / 3) * (1 - x**2) ** (-2 / 3)
    )
    x = np.linspace(0.001, 0.99, 100)
elif case == 2:
    dfunc = lambda x: 2 * x * (x + np.sin(x)) * np.exp(-1 * x**2) - (
        np.cos(x) + 1
    ) * np.exp(-1 * x**2)
    d2func = (
        lambda x: -np.exp(-1 * x**2) * (x + np.sin(x)) * (4 * x**2)
        + 4 * x * (np.cos(x) + 1) * np.exp(-1 * x**2)
        + (2 * x + 2 * np.sin(x)) * np.exp(-1 * x**2)
        + np.exp(-1 * x**2) * np.sin(x)
    )
    x = np.linspace(-10, 10, 100)
elif case == 3:
    dfunc = lambda x: 5 * (x**2 - 2 * x - 1) / ((x**2 + 1) ** 2)
    d2func = (
        lambda x: (8 * x**2) * (x**2 - 5 * x + 6) * (x**2 + 1) ** (-3)
        - 4 * x * (2 * x - 5) * (x**2 + 1) ** (-2)
        + 2 * (x**2 + 1) ** (-1)
        - 2 * (x**2 - 5 * x + 6) * (x**2 + 1) ** (-2)
    )
    x = np.linspace(-4, 4, 100)

curr_guess = x0
newton_guesses = [x0]
while abs(dfunc(curr_guess)) > tol:
    curr_guess = newton_step(curr_guess, dfunc, d2func)
    newton_guesses.append(curr_guess)

newton_guesses = np.array(newton_guesses)
