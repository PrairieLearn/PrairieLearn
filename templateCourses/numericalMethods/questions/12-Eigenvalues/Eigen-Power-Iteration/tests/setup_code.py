import numpy as np
import scipy.linalg as la

n = 50
Vs = np.random.random((n, 2, 2))

As = np.zeros((n, 2, 2))
x_0 = np.ones(
    2,
)
x_0 *= 0.5**0.5

sig1 = np.random.randint(100, 105)
sig2_0 = 1.0 + np.random.random_sample()
for i in range(n):
    L = np.array([[sig1, 0.0], [0.0, sig2_0 + 1.5 * i]])
    As[i] = np.dot(np.dot(Vs[i], L), la.inv(Vs[i]))

la.old_lu_asagsdfga = la.lu


def new_lu(*args, **kwargs):
    new_lu.count += 1
    return la.old_lu_asagsdfga(*args, **kwargs)


new_lu.count = 0

la.lu = new_lu


def not_allowed(*args, **kwargs):
    raise RuntimeError("Calling this function is not allowed")


np.linalg.solve = not_allowed
np.linalg.inv = not_allowed
np.linalg.pinv = not_allowed
np.linalg.eig = not_allowed

la.solve = not_allowed
la.inv = not_allowed
la.pinv = not_allowed
la.pinv2 = not_allowed
la.eig = not_allowed
la.lu_solve = not_allowed
