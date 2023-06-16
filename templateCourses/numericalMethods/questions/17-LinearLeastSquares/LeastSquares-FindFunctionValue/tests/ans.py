import numpy as np
import numpy.linalg as la

A = np.array([xpts**i for i in range(n + 1)]).T

coeffs = la.lstsq(A, ypts)[0]

y_est = eval_func(n, pos, coeffs)
