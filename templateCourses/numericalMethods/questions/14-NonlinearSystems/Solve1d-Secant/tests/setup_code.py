import numpy as np
import scipy.optimize as opt

x1 = -10 + np.random.rand()
x2 = 10 + np.random.rand()


def f(x):
    y = (x - x1) * (x - x2)
    return y


guess1 = 50
guess2 = 100

xks = np.array([guess1, guess2], dtype=float)


def not_allowed(*args, **kwargs):
    raise RuntimeError("Calling this function is not allowed")


opt.newton = not_allowed
opt.minimize = not_allowed
opt.minimize_scalar = not_allowed
