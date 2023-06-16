import random

import numpy as np
import prairielearn as pl


def max_row_sum(matrix):
    max_sum = 0
    for i in range(matrix.shape[0]):
        max_sum = max(max_sum, abs(matrix[i, :]).sum())
    return max_sum


def max_col_sum(matrix):
    max_sum = 0
    for i in range(matrix.shape[1]):
        max_sum = max(max_sum, abs(matrix[:, i]).sum())
    return max_sum


def generate(data):

    n = random.choice([7, 9])
    mat = np.asarray(np.random.choice(list(range(-15, 15)), n * n)).reshape((n, n))

    for i in range(len(mat)):
        num_zeros = np.random.choice(list(range(n // 2 + 1, n - 2)), 1)
        indices = random.sample(range(0, n), int(num_zeros))
        (mat[i, :])[indices] = 0

    inf_norm = max_row_sum(mat)
    one_norm = max_col_sum(mat)

    while inf_norm == one_norm:
        mat = np.asarray(np.random.choice(list(range(-15, 15)), n * n)).reshape((n, n))
        inf_norm = max_row_sum(mat)
        one_norm = max_col_sum(mat)

    data["params"]["matrix"] = pl.to_json(mat)
    data["correct_answers"]["f"] = int(inf_norm)

    return data


def grade(data):
    if data["score"] != 1.0:
        feedback = "See section The matrix p-norm in notes for Vectors, Matrices, and Norms. https://courses.engr.illinois.edu/cs357/notes/ref-8-vec-mat.html"
    else:
        feedback = ""
    data["feedback"]["question_feedback"] = feedback
