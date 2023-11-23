import io
import random

import matplotlib.pyplot as plt
import numpy as np


def file(data):
    if data["filename"] == "cos-x.png":
        # data points
        # coeff cos(x) from -5 * pi 5 * pi, stepping 0.01
        coeff = random.randint(1, 5)
        x = np.arange(-5 * np.pi, 5 * np.pi, 0.01)
        y = coeff * np.cos(x)

        # create plot
        plt.plot(x, y)
        plt.title(f"{coeff} * cos(x)")
        plt.xlabel("x values")
        plt.ylabel("y values")
        plt.ylim(-6, 6)

        # save plot as utf-8 bytes
        f = io.BytesIO()
        plt.savefig(f, format="png")
        return f
