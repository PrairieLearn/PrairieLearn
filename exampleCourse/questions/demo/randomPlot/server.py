import io
import random

import matplotlib.pyplot as plt
import numpy as np
import sympy as sp


def file(data):
    if data["filename"] == "figure.png" or data["filename"] == "submission.png":
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

        if (
            data["filename"] == "submission.png"
            and data["submitted_answers"].get("f") is not None
        ):
            marker_style = (
                "ko"  # Not scored (save-only submission): black circle
                if data["partial_scores"].get("f") is None
                else "gs"  # Correct: green square
                if data["partial_scores"]["f"].get("score") == 1
                else "rx"  # Incorrect: red X
            )
            plt.plot(data["params"]["x"], data["submitted_answers"]["f"], marker_style)
            plt.annotate(
                f"({data['params']['x']}, {data['submitted_answers']['f']})",
                (data["params"]["x"], data["submitted_answers"]["f"]),
                textcoords="offset points",
                xytext=(0, 10),
                ha="center",
            )

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

    # Extract formula for representation
    formula = m * sp.symbols("x") + b

    data["params"]["m"] = m
    data["params"]["b"] = b
    data["params"]["x"] = x
    data["params"]["formula_latex"] = sp.latex(formula)
    data["correct_answers"]["f"] = f
