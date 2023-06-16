import random

import numpy as np
import scipy.linalg as sla

M = random.randint(20, 31)
# while (True):
#     N = random.randint(3,6)
#     if (N != M):
#         break
N = random.randint(10, 16)
k = random.randint(2, N)


# Generating the orthogonal matrix U
# (numbers rounded with 2 decimal digits)
X = np.random.rand(M, M)
Q, R = sla.qr(X)
U = np.around(Q[:, :N], 2)
# Ut = U.T

# Generating the orthogonal matrix V
# (numbers rounded with 2 decimal digits)
Y = np.random.rand(N, N)
Q, R = sla.qr(Y)
V = np.around(Q, 2)
# Vt = V.T

# Generating the diagonal matrix Sigma
singval = random.sample(range(1, 20), k)
singval.sort()
sigmavec = singval[::-1]
sigma = np.zeros((N, N))
sigma[:k, :k] = np.diag(sigmavec)
