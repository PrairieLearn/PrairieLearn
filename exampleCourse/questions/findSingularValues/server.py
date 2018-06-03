

import random, math
import numpy as np
import prairielearn as pl
import scipy.linalg as sla

def generate(data):

    # Matrix shape
    M = random.randint(3,6)
    while (True):
        N = random.randint(3,5)
        if (N != M):
            break
    r = min(M,N)

    # Generating the orthogonal matrix U
    # (numbers rounded with 2 decimal digits)
    X = np.random.rand(M,M)
    Q,R = sla.qr(X)
    U = np.around(Q,2)

    # Generating the orthogonal matrix V
    # (numbers rounded with 2 decimal digits)
    Y = np.random.rand(N,N)
    Q,R = sla.qr(Y)
    V = np.around(Q,2)
    Vt = V.T

    # Generating the diagonal matrix Sigma
    singval = random.sample(range(1, 20), r)
    singval.sort()
    sigmavec = singval[::-1]
    sigma = np.zeros((M,N))
    for i,sing in enumerate(sigmavec):
        sigma[i,i] = sing


    data["params"]["U"] = pl.to_json(U)
    data["params"]["sigma"] = pl.to_json(sigma)
    data["params"]["Vt"] = pl.to_json(Vt)

    data["correct_answers"]["singval"] = pl.to_json([sigmavec])


    return data
