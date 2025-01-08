import io
import random

import matplotlib.pyplot as plt
import numpy as np


def generate(data):
    # Select a random shape.
    shape = random.choice(["diamond", "circle"])
    data["params"]["shape"] = shape

    # Select a random radius.
    radius = random.randint(1, 4)
    data["params"]["radius"] = radius

    # Provide a name and label for the dimension.
    if shape == "diamond":
        data["params"]["dimension_name"] = "length of the diagonal"
        data["params"]["dimension_label"] = "diamond diagonal"
    else:
        data["params"]["dimension_name"] = "diameter"
        data["params"]["dimension_label"] = "circle diameter"

    # Compute the correct answer.
    data["correct_answers"]["dimension"] = 2 * radius


def file(data):
    # This creates a dynamic figure (either a circle or diamond)
    # depending on the parameters defined in the `generate` function.
    if data["filename"] == "shape.png":
        shape = data["params"]["shape"]
        radius = data["params"]["radius"]

        # Set up a figure.
        plt.rcParams.update({"font.size": 30})
        plt.figure(figsize=(10, 10))
        plt.grid()
        plt.xlim([-5, 5])
        plt.ylim([-5, 5])

        if shape == "diamond":
            # Compute a set of points to plot a diamond.
            x = [0, radius, 0, -radius, 0]
            y = [radius, 0, -radius, 0, radius]
        else:
            # Compute a set of points to plot a circle.
            phi = np.linspace(0, 2 * np.pi, 500)
            x = radius * np.cos(phi)
            y = radius * np.sin(phi)

        # Plot the points.
        plt.plot(x, y, "-", linewidth=6)

        # Return the figure as a file-like object.
        buf = io.BytesIO()
        plt.savefig(buf, format="png")
        return buf
