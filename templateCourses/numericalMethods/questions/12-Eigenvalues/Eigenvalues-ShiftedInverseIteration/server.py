import random

import numpy as np
import prairielearn as pl

# Improve: Make sure that there are cases where it is hard
# to tell the correct answer


def generate(data):
    # make a random 5x5 upper triangular matrix with es as the diagonal
    # make sure that es have a unique magnitude but can be positive or negative
    n = 5
    # Create random diagonal entries (eigenvalues)
    vals = np.arange(2, 18, step=3)
    es = np.array(np.random.choice(vals, n, replace=False))
    es = np.random.choice(np.array([-1, 1]), n) * es

    # choose a shift and make sure the shifted matrix doesn't have a 0 eigenvalue
    shift = random.choice(es) + np.random.choice(np.array([-1, 1]))

    # while True:
    #    if np.abs(shift) in np.abs(es):
    #        shift = random.choice(es) + np.random.choice(np.array([-1, 1]))
    #    else:
    #        break

    A = np.diag(es)
    for i in range(n):
        for j in range(i + 1, n):
            A[i, j] = np.random.randint(-17, 15)

    # find the closest eigenvalue to 0 once shifted
    closest_eigenvalue, diff = np.inf, np.inf
    for i in range(len(es)):
        if np.abs(es[i] - shift) < diff:
            closest_eigenvalue = es[i]
            diff = np.abs(es[i] - shift)

    if shift > 0:
        data["params"]["shift"] = "-" + str(shift)
    else:
        data["params"]["shift"] = "+" + str(abs(shift))

    data["params"]["A"] = pl.to_json(A.astype(np.int32))
    data["correct_answers"]["closest_eigenvalue"] = float(closest_eigenvalue)
    return data
