import random

import numpy as np
import prairielearn as pl


def generate(data):
    # make a random sparse matrix
    N = random.choice([5, 6])
    tuples = []
    for i in range(N):
        for j in range(N):
            tuples.append((i, j))
    np.random.shuffle(tuples)
    k = np.random.randint(5, 8)
    A = np.array(random.sample(range(1, 100), N**2)).reshape(N, N) / 10

    for i, j in tuples[k:]:
        A[i, j] = 0

    # convert random sparse matrix to COO format
    A = np.array(A)
    row = []
    col = []
    Data = []
    for i in range(N):
        for j in range(N):
            if A[i, j] != 0:
                Data.append(A[i, j])
                row.append(i)
                col.append(j)

    row = np.array(row)
    col = np.array(col)
    Data = np.array(Data)
    permutation = np.random.permutation(k)

    row = row[permutation]
    col = col[permutation]
    Data = Data[permutation]

    data["params"]["A"] = pl.to_json(A)
    data["params"]["Adata"] = pl.to_json(Data.reshape(1, k))
    data["correct_answers"]["Row"] = pl.to_json(row.reshape(1, k))
    data["correct_answers"]["Col"] = pl.to_json(col.reshape(1, k))
    data["correct_answers"]["bytes"] = (64 * k / 8) + (32 * (len(row) + len(col)) / 8)
    return data
