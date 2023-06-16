import random

import numpy as np


def generate(data):

    e1_me = np.random.randint(3, 12)
    e2_me = np.random.randint(5, 20)

    a = -np.random.randint(2, 9)
    x = np.array([a, a])
    x = x.reshape(2, 1)

    A = random.choice([1, -1]) * np.random.randint(2, 7)
    B = random.choice([1, -1]) * np.random.randint(2, 7)

    y = A * np.array([1, 1]) + B * np.array([1, -1])
    y = y.reshape(2, 1)
    x = x.tolist()
    y = y.tolist()

    data["params"]["x"] = x
    data["params"]["y"] = y

    data["params"]["e1_me"] = e1_me
    data["params"]["e2_me"] = e2_me

    data["correct_answers"]["homogenous"] = abs(a) * e1_me
    data["correct_answers"]["lin"] = e1_me * abs(A) + e2_me * abs(B)

    return data


def grade(data):
    if data["score"] != 1.0:
        feedback = "For this problem, we need to know the properties of a vector norm. In particular we will be using homogeneity and the triangle inequality. See section on Vector Norm in notes for Vectors, Matrices and Norms. https://courses.engr.illinois.edu/cs357/notes/ref-8-vec-mat.html"
    else:
        feedback = ""
    data["feedback"]["question_feedback"] = feedback
