import numpy as np
import prairielearn as pl


def generate(data):

    # choice = np.random.choice(np.arange(3,dtype='int'), p=[0.7, 0.2, 0.1])
    choice = np.random.choice([0, 1], p=[0.8, 0.2])
    if choice == 0:
        # random graph
        n = 4
        correct = (
            np.random.choice([0, 1], size=(n, n), p=[0.5, 0.5])
            * np.random.rand(n, n)
            * np.random.randint(1, 5, size=(n, n))
        )
    elif choice == 1:
        n = 5
        shift = np.random.choice([1, -1]) * np.random.randint(1, n - 2)
        correct = (
            np.roll(np.diag(np.ones(n)), shift)
            * np.random.rand(n, n)
            * np.random.randint(1, 5, size=(n, n))
        )
    else:
        # complete graph
        n = 4
        correct = np.random.rand(n, n) * np.random.randint(1, 5, size=(n, n))

    mat = correct.T
    for i in range(len(mat)):
        col_sum = np.sum(mat[:, i])
        if col_sum != 0:
            mat[:, i] = mat[:, i] / col_sum
        else:
            mat[0, i] = 0.5
            mat[n - 1, i] = 0.5
    mat = np.around(mat, decimals=2)
    for i in range(len(mat)):
        col_diff = 1 - np.sum(mat[:, i])
        ind = np.argmax(mat[:, i])
        mat[ind, i] += col_diff
    data["correct_answers"]["mat"] = pl.to_json(mat)
    data["params"]["mat"] = data["correct_answers"]["mat"]
    return data
