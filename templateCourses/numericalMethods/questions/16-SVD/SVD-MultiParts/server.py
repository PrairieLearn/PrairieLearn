import random

import numpy as np
import prairielearn as pl
import scipy.linalg as sla


def generate(data):

    # Matrix shape
    M, N = random.sample(range(2, 4), 2)
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

    data["params"]["U"] = pl.to_json(U)
    data["params"]["sigma"] = pl.to_json(sigma)
    data["params"]["Vt"] = pl.to_json(Vt)

    data["correct_answers"]["u1"] = M
    data["correct_answers"]["u2"] = r
    data["correct_answers"]["s1"] = r
    data["correct_answers"]["s2"] = r
    data["correct_answers"]["v1"] = N
    data["correct_answers"]["v2"] = r
    data["correct_answers"]["cond2"] = cond2
    data["correct_answers"]["norm2"] = norm2

    return data
