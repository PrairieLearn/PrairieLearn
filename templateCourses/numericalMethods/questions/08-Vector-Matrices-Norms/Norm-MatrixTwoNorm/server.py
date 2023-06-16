import numpy as np
import numpy.linalg as la
import prairielearn as pl


def generate(data):

    M = np.random.randint(-100, 100, size=(3,)) / 10.0
    A = np.around(np.diag(M), 1)

    data["params"]["A"] = pl.to_json(A)
    data["correct_answers"]["two-norm"] = la.norm(A, 2)
    return data


def grade(data):
    if data["score"] != 1.0:
        feedback = "In the notes for Vectors, Matrices, and Norms, we have a section discussing norms. In particular, there is a section about p-norms and special cases of p. Because the matrix provided is a diagonal matrix, the diagonal entries are the eigenvalues."
    else:
        feedback = ""
    data["feedback"]["question_feedback"] = feedback
