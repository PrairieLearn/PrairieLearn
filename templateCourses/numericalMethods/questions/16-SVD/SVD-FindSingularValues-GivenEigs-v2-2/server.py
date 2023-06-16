import random
from random import shuffle

import numpy as np
import prairielearn as pl
import scipy.linalg as sla


def generate(data):

    # Matrix shape
    # M = 3
    M = np.random.choice([2, 3, 4])

    # Generating the orthogonal matrix U
    # (numbers rounded with 2 decimal digits)
    X = np.random.rand(M, M)
    Q, R = sla.qr(X)
    X = np.around(Q, 2)
    Xt = X.T

    # Generating the diagonal matrix Sigma
    singval = random.sample(range(1, 16), M)
    singval.sort()
    sigmavec = singval[::-1]
    new_vec = sigmavec[:]
    shuffle(new_vec)
    sigma = np.diag(new_vec)

    lambdavec = np.sqrt(sigmavec)

    idx = np.random.randint(M)

    if M == 2:
        data["params"]["compare"] = "\\sigma_1 > \\sigma_2"
    elif M == 3:
        data["params"]["compare"] = "\\sigma_1 > \\sigma_2 > \\sigma_3"
    else:
        data["params"]["compare"] = "\\sigma_1 > \\sigma_2 > \\sigma_3 > \\sigma_4"

    data["params"]["X"] = pl.to_json(X)
    data["params"]["sigma"] = pl.to_json(sigma)
    data["params"]["Xt"] = pl.to_json(Xt)

    data["params"]["sL"] = idx + 1

    data["correct_answers"]["s"] = lambdavec[idx]
    # data["correct_answers"]["V"] = pl.to_json(X)

    return data
