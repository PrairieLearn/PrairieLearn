import random

import numpy as np
import numpy.linalg as la
import scipy.linalg as sla

M = random.randint(3, 6)
# while (True):
#     N = random.randint(3,6)
#     if (N != M):
#         break
N = random.randint(3, 6)
r = min(M, N)

# Generating the orthogonal matrix U
# (numbers rounded with 2 decimal digits)
X = np.random.rand(M, M)
Q, R = sla.qr(X)
U = np.around(Q, 2)
# Ut = U.T

# Generating the orthogonal matrix V
# (numbers rounded with 2 decimal digits)
Y = np.random.rand(N, N)
Q, R = sla.qr(Y)
V = np.around(Q, 2)
# Vt = V.T

# Generating the diagonal matrix Sigma
if r == 3:
    rankA = r - 1
else:
    s = random.choice([1, 2])
    rankA = r - s
singval = random.sample(range(1, 9), rankA)
singval.sort()
sigmavec = np.array(singval[::-1])
sigma = np.zeros((M, N))
# sigma_plus = np.zeros((N,M))
for i, sing in enumerate(sigmavec):
    sigma[i, i] = sing
    # sigma_plus[i,i] = 1/sing

# A_plus = np.dot(np.dot(V, sigma_plus), Ut)


def not_allowed(*args, **kwargs):
    raise RuntimeError("Calling pinv() is not allowed in this question")


la.pinv = not_allowed
sla.pinv = not_allowed
