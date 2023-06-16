import numpy as np


def eval_func(n, x, coeffs):
    y_est = 0
    for i in range(n + 1):
        y_est = y_est + coeffs[i] * x**i
    return y_est


xpts = np.array(data["params"]["xdata"])
ypts = np.array(data["params"]["ydata"])
n = data["params"]["n"]
pos = data["params"]["pos"]


def not_allowed(*args, **kwargs):
    raise RuntimeError("Calling this function is not allowed in this question.")


np.polyfit = not_allowed
np.polynomial.polynomial.polyfit = not_allowed
