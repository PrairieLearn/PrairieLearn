import numpy as np
import prairielearn as pl


def generate(data):
    A = np.zeros((2, 2))
    data["correct_answers"]["A"] = pl.to_json(A)


def grade(data):
    # get the submitted answers
    MatrixA = pl.from_json(data["submitted_answers"]["A"])
    MatrixB = MatrixA.dot(MatrixA)

    if (not MatrixB.any()) and MatrixA.any():
        data["partial_scores"]["A"] = {"score": 1, "weight": 1}
        data["score"] = 1.0
    else:
        data["score"] = 0
