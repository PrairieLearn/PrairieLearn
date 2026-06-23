import io
import random

import matplotlib.pyplot as plt
import numpy as np

MIN_X, MAX_X = -5, 5


def file(data):
    if data["filename"] == "figure.png":
        # Create the figure
        x = np.linspace(MIN_X, MAX_X)
        f = data["params"]["m"] * x + data["params"]["b"]
        fig = plt.figure()
        plt.plot(x, f)
        plt.xticks(list(range(-5, 6, 1)), fontsize=14)

        fmin = int(np.floor(min(f)) - 1)
        fmax = int(np.ceil(max(f)) + 1)
        if fmax - fmin > 12:
            plt.yticks(list(range(fmin, fmax + 4, 4)), fontsize=14)
            plt.gca().set_yticks(list(range(fmin, fmax + 1, 1)), minor=True)
            plt.gca().yaxis.grid(visible=True, which="minor")
        else:
            plt.yticks(list(range(fmin, fmax + 1, 1)), fontsize=14)
        plt.grid()
        plt.xlabel("$x$", fontsize=18)
        plt.ylabel("$f(x)$", fontsize=18)
        plt.autoscale(enable=True, tight=True)
        fig.set_layout_engine("tight")

        # Save the figure and return it as a buffer
        buf = io.BytesIO()
        plt.savefig(buf, format="png")
        return buf


def generate(data):
    # Pick a non-zero slope
    m = random.choice([-1, 1]) * random.randint(1, 2)

    # Pick a y-intercept
    b = random.randint(-3, 3)

    def f(t):
        return m * t + b

    # Pick x that is not at the boundary of the plot
    x = random.randint(MIN_X + 1, MAX_X - 1)

    data["params"]["m"] = m
    data["params"]["b"] = b
    data["params"]["x"] = x
    data["correct_answers"]["f"] = f(x)

    # alt label helpers for where the line enters/exits the plot
    data["params"]["left"] = repr((MIN_X, f(MIN_X)))
    data["params"]["right"] = repr((MAX_X, f(MAX_X)))
