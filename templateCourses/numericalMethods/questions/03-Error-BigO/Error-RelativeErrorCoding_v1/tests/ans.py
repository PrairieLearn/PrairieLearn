import numpy as np


def f(x):
    return x**0.72


relative_error = np.abs(f_hat(x) - f(x)) / np.abs(f(x))
