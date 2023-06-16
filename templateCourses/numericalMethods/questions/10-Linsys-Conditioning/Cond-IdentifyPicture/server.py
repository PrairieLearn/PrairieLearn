import io
import random

import matplotlib.pyplot as plt
import numpy as np


def file(data):

    p = data["params"]["p"]
    p_name = p
    if p == "\\infty":
        p = np.inf
    else:
        p = int(p)

    t = np.linspace(0, 2 * np.pi, 1000)
    X = np.zeros((2, 1000))
    X[0, :] = np.cos(t)
    X[1, :] = np.sin(t)
    X /= np.linalg.norm(X, p, axis=0)
    theta = np.pi / np.random.randint(1, 8)
    candidate_matrices = [
        np.array([[np.random.randint(7, 10), 0.5], [0.5, 0]]),
        np.random.randint(2, 5) * np.eye(2),  # scaled
        np.random.randint(4, 9)
        * np.array(
            [[np.cos(theta), -np.sin(theta)], [np.sin(theta), np.cos(theta)]]
        ),  # Rotation
        np.random.randint(1, 3) * np.array([[1, np.random.randint(2, 5)], [0, 1]]),
    ]  # sheared, but not much

    if data["filename"] == "ill.png":
        Y = np.dot(candidate_matrices[0], X)

    if data["filename"] == "well-1.png":
        Y = np.dot(candidate_matrices[1], X)

    if data["filename"] == "well-2.png":
        Y = np.dot(candidate_matrices[2], X)

    if data["filename"] == "well-3.png":
        Y = np.dot(candidate_matrices[3], X)

    fig, ax = plt.subplots()
    label = "$" + str(p_name) + "$-ball"
    ax.plot(X[0, :], X[1, :], c="r", label=label)
    ax.plot(Y[0, :], Y[1, :], c="b", label="Transformed " + label)
    ax.legend()

    ax.spines["bottom"].set_position("zero")
    ax.spines["left"].set_position("zero")
    ax.spines["right"].set_color("none")
    ax.spines["top"].set_color("none")
    ax.set_xlim((-11, 11))
    ax.set_ylim((-11, 11))
    ax.set_aspect("equal")

    # Save the figure and return it as a buffer
    buf = io.BytesIO()
    fig.savefig(buf, bbox_inches="tight", format="png")
    return buf


def generate(data):

    p = random.choice(["1", "2", "\\infty"])
    data["params"]["p"] = p

    return data
