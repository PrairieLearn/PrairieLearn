import io
import random

import matplotlib.pyplot as plt
import numpy as np
import numpy.linalg as la


def file(data):

    if data["filename"] == "matrix-ellipse.png":

        A = np.array(
            [
                [float(data["params"]["A00"]), float(data["params"]["A01"])],
                [float(data["params"]["A10"]), float(data["params"]["A11"])],
            ],
            dtype=np.dtype(float),
        )

        t = np.linspace(0, 2 * np.pi, 1000)
        X = np.zeros((2, 1000))
        X[0, :] = np.cos(t)
        X[1, :] = np.sin(t)

        p = data["params"]["p"]
        if p == "\\infty":
            p = np.inf
        else:
            p = int(p)

        X /= la.norm(X, p, axis=0)
        Y = np.dot(A, X)

        fig, ax = plt.subplots(figsize=(5, 5))
        label = "$" + str(data["params"]["p"]) + "$-ball"
        ax.plot(X[0, :], X[1, :], c="r", label=label)
        ax.plot(Y[0, :], Y[1, :], c="b", label="Transformed " + label)
        max_val = np.max(Y) + 1
        ax.axis([-max_val, max_val, -max_val, max_val])
        ax.grid()
        ax.legend()

    # Save the figure and return it as a buffer
    buf = io.BytesIO()
    plt.savefig(buf, format="png")
    return buf


def generate(data):

    p = random.choice([1, 2, np.inf])

    # get v1 and v2 on unit circle
    v1 = np.array([1.0, 1.0])
    v1 /= la.norm(v1, p)

    v2 = np.array([-1.0, 1.0])
    v2 /= la.norm(v2, p)

    V = np.array([v1, v2]).T

    # generate Av1 and Av2 randomly
    Av1_1 = np.random.randint(3, 6)
    Av1_2 = Av1_1
    Av1 = np.array([Av1_1, Av1_2])

    Av2_1 = -np.random.randint(1, 3)
    Av2_2 = -Av2_1
    Av2 = np.array([Av2_1, Av2_2])

    AV = np.array([Av1, Av2]).T

    # calculate A
    A = np.dot(AV, la.inv(V))

    data["params"]["A00"] = str(A[0, 0])
    data["params"]["A01"] = str(A[0, 1])
    data["params"]["A10"] = str(A[1, 0])
    data["params"]["A11"] = str(A[1, 1])

    data["params"]["v1_1"] = v1[0]
    data["params"]["v1_2"] = v1[1]
    data["params"]["v2_1"] = v2[0]
    data["params"]["v2_2"] = v2[1]

    data["params"]["Av1_1"] = Av1_1
    data["params"]["Av1_2"] = Av1_2
    data["params"]["Av2_1"] = Av2_1
    data["params"]["Av2_2"] = Av2_2
    data["correct_answers"]["ans"] = la.norm(A, p)

    pstring = "\\infty" if p == np.inf else str(p)
    data["params"]["p"] = pstring
    return data


def grade(data):
    if data["score"] != 1.0:
        feedback = "For this problem, we need to consider the definition of a p-norm of a matrix. Then, we need to find the vector that maximizes the quantity, according to the definition. See section The matrix p-norm for notes on Vectors, Matrices, and Norms. https://courses.engr.illinois.edu/cs357/notes/ref-8-vec-mat.html"
    else:
        feedback = ""
    data["feedback"]["question_feedback"] = feedback
