import io
import random

import matplotlib.pyplot as plt
import numpy as np


def file(data):
    if data["filename"] == "figure.png":
        # Create the figure
        x = np.linspace(-5, 5)
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
    while True:
        m = random.randint(-2, 2)
        if m != 0:
            break

    # Pick a y-intercept
    b = random.randint(-3, 3)

    # Pick x
    x = random.randint(-5, 5)

    # Find f(x)
    f = m * x + b

    data["params"]["m"] = m
    data["params"]["b"] = b
    data["params"]["x"] = x
    data["correct_answers"]["f"] = f
