import random

import numpy as np
import prairielearn as pl
import scipy.linalg as sla


def generate(data):

    # Matrix shape
    M = random.choice([3, 4])

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
    sigmavec = np.array(singval[::-1])
    sigma = np.diag(sigmavec)

    A = np.dot(np.dot(U, sigma), Vt)

    # eigendecomposition A.T@A = X @ D @ X.T
    # where X = V and D = sigma**2
    Dmat = sigma**2

    AV = np.dot(A, V)
    Uans = AV @ np.diag(1 / sigmavec)

    """print("A = ",A)
    print("U = ", U)
    print("Vt = ", Vt)
    print("Sigma = ", sigma)
    print("svd(A) = ",np.linalg.svd(A))
    print("A.T@A = ",np.dot(A.T,A))
    print("V @ Dmat @ Vt = ",V @ Dmat @ Vt)
    print("eig(A.T@A)")
    print(np.linalg.eig(V @ Dmat @ Vt))"""

    data["params"]["X"] = pl.to_json(V)
    data["params"]["eigs"] = pl.to_json(Dmat)
    data["params"]["Xt"] = pl.to_json(Vt)
    data["params"]["AV"] = pl.to_json(AV)

    data["correct_answers"]["Uans"] = pl.to_json(Uans)

    return data
