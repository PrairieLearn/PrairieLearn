import random
from random import shuffle

import numpy as np
import prairielearn as pl
import scipy.linalg as sla


def generate(data):

    # Matrix shape
    M = 3

    # Generating the orthogonal matrix U
    # (numbers rounded with 2 decimal digits)
    X = np.random.rand(M, M)
    Q, R = sla.qr(X)
    U = np.around(Q, 2)

    # Generating the orthogonal matrix V
    # (numbers rounded with 2 decimal digits)
    Y = np.random.rand(M, M)
    Q, R = sla.qr(Y)
    V = np.around(Q, 2)
    Vt = V.T

    # Generating the diagonal matrix Sigma
    singval = random.sample(range(1, 9), M)
    singval.sort()
    sigmavec = singval[::-1]
    new_vec = sigmavec[:]
    shuffle(new_vec)
    sigma = np.diag(new_vec)

    data["correct_answers"]["s1"] = sigmavec[0] ** 2
    data["correct_answers"]["s2"] = sigmavec[1] ** 2
    data["correct_answers"]["s3"] = sigmavec[2] ** 2

    data["params"]["U"] = pl.to_json(U)
    data["params"]["sigma"] = pl.to_json(sigma)
    data["params"]["Vt"] = pl.to_json(Vt)

    return data
