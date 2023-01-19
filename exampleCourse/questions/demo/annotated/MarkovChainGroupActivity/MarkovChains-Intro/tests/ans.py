import numpy as np
import numpy.linalg as la

def power_iteration(M, x):
    xc = x.copy()
    for _ in range(100):
        xc = M @ xc
    return xc

M_test = np.array([[0.3, 0.1], [0.7, 0.9]])
x_test = np.array([1.0, 0.0])
M_hidden = np.array([[0.4, 0.2], [0.6, 0.8]])
x_hidden = np.array([0.0, 1.0])
xc = power_iteration(M_test, x_test)
xc_hidden = power_iteration(M_hidden, x_hidden)
