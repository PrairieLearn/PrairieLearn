import random

import numpy as np
import prairielearn as pl
import scipy.linalg as sla


def generate(data):

    # Matrix shape
    M = random.randint(4, 5)
    N = random.randint(3, M - 1)
    r = min(M, N)

    # Generating the orthogonal matrix U
    # (numbers rounded with 2 decimal digits)
    X = np.random.rand(M, M)
    Q, R = sla.qr(X)
    U = np.around(Q, 2)

    # Generating the orthogonal matrix V
    # (numbers rounded with 2 decimal digits)
    Y = np.random.rand(N, N)
    Q, R = sla.qr(Y)
    V = np.around(Q, 2)
    Vt = V.T

    # Generating the diagonal matrix Sigma
    singval = random.sample(range(1, 9), r)
    singval.sort()
    sigmavec = singval[::-1]
    sigma = np.zeros((M, N))
    for i, sing in enumerate(sigmavec):
        sigma[i, i] = sing

    # A = np.dot(np.dot(U,sigma),Vt)
    # u, s, vt = np.linalg.svd(A)
    # print(np.linalg.norm(A,2))
    norm2 = sigmavec[0]
    cond2 = sigmavec[0] / sigmavec[-1]
    # print(cond2)
    # print(np.linalg.cond(A))

    max_sigma_Ainv = 1 / sigmavec[-1]

    # Desired low-rank Approximation
    k = 1
    A1 = U[:, :k] @ np.diag(sigmavec[:k]) @ Vt[:k, :]
    k = 2
    A2 = U[:, :k] @ np.diag(sigmavec[:k]) @ Vt[:k, :]

    N = random.choice([1, 2])
    data["params"]["U"] = pl.to_json(U)
    data["params"]["sigma"] = pl.to_json(sigma)
    data["params"]["Vt"] = pl.to_json(Vt)
    data["params"]["N"] = N

    data["correct_answers"]["A1"] = pl.to_json(A1)
    data["correct_answers"]["A2"] = pl.to_json(A2)

    data["correct_answers"]["rankNerror"] = sigmavec[N]

    return data
