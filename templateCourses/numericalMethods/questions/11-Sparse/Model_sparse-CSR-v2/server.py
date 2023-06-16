import numpy as np
import prairielearn as pl

# from sympy import *


def generate(data):
    N = 4
    tuples = []
    for i in range(N):
        for j in range(N):
            tuples.append((i, j))
    np.random.shuffle(tuples)
    k = np.random.randint(7, 9)
    A = np.random.randint(1, 10, size=(N, N)) / 10
    for i, j in tuples[k:]:
        A[i, j] = 0

    A = np.array(A)
    row = [0]
    col = []
    Data = []
    total = 0
    for i in range(N):
        arr = A[i]
        for j in range(N):
            if arr[j] != 0:
                total += 1
                Data.append(arr[j])
        row.append(total)
    for i in range(N):
        arr = A[i]
        for j in range(N):
            if arr[j] != 0:
                col.append(j)

    row = np.array([row])
    col = np.array([col])
    Data = np.array([Data])

    data["correct_answers"]["A"] = pl.to_json(A)
    data["params"]["data"] = pl.to_json(Data)
    data["params"]["row"] = pl.to_json(row)
    data["params"]["col"] = pl.to_json(col)
    return data
