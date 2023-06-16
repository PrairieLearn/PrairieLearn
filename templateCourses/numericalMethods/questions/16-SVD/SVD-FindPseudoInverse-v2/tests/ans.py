import numpy as np

sigma_plus = np.zeros((V.shape[0], U.shape[0]))
for i, sing in enumerate(sigmavec):
    sigma_plus[i, i] = 1 / sing

Ut = U.T
A_plus = np.dot(np.dot(V, sigma_plus), Ut)
