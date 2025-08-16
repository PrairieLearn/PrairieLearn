import numpy as np
import numpy.linalg as la


def not_allowed(*args, **kwargs):
    raise RuntimeError("Usage of this function is not allowed in this question.")


# set up parameters
n = np.random.randint(4, 16)

# generate a random full-rank matrix by generating a random eigenvector basis and nonzero eigenvalues
X = la.qr(np.random.random_sample((n, n)))[0]
D = np.diag(np.random.random_sample(n) * 10 + 1)
A = X.T @ D @ X

b = np.random.random(n)

la.inv = not_allowed
la.pinv = not_allowed
