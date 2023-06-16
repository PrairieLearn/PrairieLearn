import numpy as np
import numpy.linalg as la


def f(x, y):
    return np.array([x**3 - y**2, x + y * x**2 - 2])


def J(x, y):
    return np.array([[3 * x**2, -2 * y], [1 + 2 * x * y, x**2]])


x = xi

for k in range(100):
    s = la.solve(J(x[0], x[1]), -f(x[0], x[1]))
    x = x + s
    res = la.norm(f(x[0], x[1]))
    if res < tol:
        break

root = x
