import numpy as np
import prairielearn as pl
import scipy.linalg as la


def generate(data):

    ## SVD Matrices
    N = 4
    # U is permutation of identity
    U = np.eye(N + 1, dtype=int)[np.random.permutation(np.arange(0, N + 1))]
    U = U[:, :-1]

    # V is generated via QR factorization of random matrix
    AA = np.random.randn(4, 4)
    V_ex, R = la.qr(AA)

    V = np.around(V_ex, 2)

    # matrix is of rank 3
    rank = 3
    s_val = np.flip(np.sort(np.random.choice(np.arange(1, 10), rank, replace=False)))
    S = np.zeros((4, 4), dtype=int)
    S[:3, :3] = np.diag(s_val)

    ## right hand side
    b = np.random.randint(0, 10, N + 1)

    # minimum norm solution
    c = (U.T).dot(b)
    x = np.zeros(
        4,
    )
    for i in range(rank):
        x += (c[i] / s_val[i]) * V[:, i]

    x = np.around(x, 2)

    A = U.dot(S.dot(V.T))

    # other solutions y_i
    # because of rounding, must ensure ||x|| < ||y_i|| and ||b - Ax|| <= ||b-Ay_i|| or it may trick students
    z = 2 * np.random.randn()
    y_1 = np.around(x + z * V[:, -1], 2)
    while la.norm(b - A.dot(x)) / la.norm(b - A.dot(y_1)) >= 1:
        z = 2 * np.random.randn()
        y_1 = np.around(x + z * V[:, -1], 2)

    z = 2 * np.random.randn()
    y_2 = np.around(x + z * V[:, -1], 2)
    while la.norm(b - A.dot(x)) / la.norm(b - A.dot(y_2)) >= 1:
        z = 2 * np.random.randn()
        y_2 = np.around(x + z * V[:, -1], 2)

    z = 2 * np.random.randn()
    y_3 = np.around(x + z * V[:, -1], 2)
    while la.norm(b - A.dot(x)) / la.norm(b - A.dot(y_3)) >= 1:
        z = 2 * np.random.randn()
        y_3 = np.around(x + z * V[:, -1], 2)

    z = 2 * np.random.randn()
    y_4 = np.around(x + z * V[:, -1], 2)
    while la.norm(b - A.dot(x)) / la.norm(b - A.dot(y_4)) >= 1:
        z = 2 * np.random.randn()
        y_4 = np.around(x + z * V[:, -1], 2)

    data["params"]["U"] = pl.to_json(U)
    data["params"]["S"] = pl.to_json(S)
    data["params"]["Vt"] = pl.to_json(V.T)
    data["params"]["b"] = pl.to_json(b.reshape(N + 1, 1))
    data["params"]["x"] = pl.to_json(x.reshape(N, 1))
    data["params"]["y_1"] = pl.to_json(y_1.reshape(N, 1))
    data["params"]["y_2"] = pl.to_json(y_2.reshape(N, 1))
    data["params"]["y_3"] = pl.to_json(y_3.reshape(N, 1))
    data["params"]["y_4"] = pl.to_json(y_4.reshape(N, 1))

    return data
