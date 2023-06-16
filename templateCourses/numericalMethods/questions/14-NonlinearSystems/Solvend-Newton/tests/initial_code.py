import numpy as np
import numpy.linalg as la


def f(x, y):
    return np.array([x**3 - y**2, x + y * x**2 - 2])


# A function that returns the Jacobian may be useful
def J(x, y):
    return np.array(...)
