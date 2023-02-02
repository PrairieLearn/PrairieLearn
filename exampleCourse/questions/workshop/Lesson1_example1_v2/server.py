import io
import random

import matplotlib.pyplot as plt
import numpy as np

plt.rcParams.update({"font.size": 30})


def generate(data):
    a = random.randint(1, 10)
    data["params"]["a"] = a

    b = random.randint(2, 5)
    data["params"]["b"] = b

    equation = "$y = " + str(a) + " - x^{" + str(b) + "}$"
    data["params"]["equation"] = equation

    x2 = a ** (1 / b)
    A = a * x2 - x2 ** (b + 1) / (b + 1)

    data["correct_answers"]["A"] = A


# The function 'file(data)' is used to generate the figure dynamically,
# given data defined in the 'generate' function
def file(data):
    if data["filename"] == "figure0.png":
        a = data["params"]["a"]
        b = data["params"]["b"]

        xp = np.linspace(0, a ** (1 / b), 500)
        yp = a - xp**b

        plt.figure(figsize=(14, 14))
        plt.plot(xp, yp, "o")
        plt.grid()
        plt.xlabel("x")
        plt.ylabel("y")

    # Save the figure and return it as a buffer
    buf = io.BytesIO()
    plt.savefig(buf, format="png")
    return buf
