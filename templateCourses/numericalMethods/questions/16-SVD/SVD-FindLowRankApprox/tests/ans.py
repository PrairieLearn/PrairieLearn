import numpy as np

m, n = U.shape
A_k = np.zeros((m, n))
s = np.diag(sigma)

for i in range(k):
    A_k += s[i] * np.outer(U[:, i], V[:, i])
