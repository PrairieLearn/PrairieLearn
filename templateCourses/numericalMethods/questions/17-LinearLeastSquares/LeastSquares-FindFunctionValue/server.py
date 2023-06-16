import io
import random

import matplotlib.pyplot as plt
import numpy as np


def file(data):

    x = data["params"]["xdata"]
    y = data["params"]["ydata"]

    fig, ax = plt.subplots()
    ax.plot(x, y, "o")
    plt.tick_params(labelsize=14)
    plt.xlabel("x", fontsize=18)
    plt.ylabel("y", fontsize=18)
    buf = io.BytesIO()
    plt.savefig(buf, format="png")

    return buf


def generate(data):

    names_for_user = [
        {
            "name": "xpts",
            "description": "x-coordinate for each point",
            "type": "1d numpy array",
        },
        {
            "name": "ypts",
            "description": "y-coordinate for each point",
            "type": "1d numpy array",
        },
        {
            "name": "eval_func",
            "description": "function detailed above",
            "type": "function",
        },
    ]
    names_from_user = [
        {
            "name": "y_est",
            "description": "value of the function evaluated at the x given above",
            "type": "float",
        }
    ]

    data["params"]["names_for_user"] = names_for_user
    data["params"]["names_from_user"] = names_from_user

    # Generating fake data
    def feval(t):
        return 1 / (1 + np.exp(-t))

    m = 30
    x = np.linspace(-4, 4, m)
    y = feval(x)
    for i in range(m):
        if abs(x[i]) < 3:
            y[i] += 0.15 * np.random.rand()

    data["params"]["xdata"] = x.tolist()
    data["params"]["ydata"] = y.tolist()
    data["params"]["pos"] = round(random.uniform(-3, 3), 2)
    data["params"]["n"] = random.choice([4, 5, 6])

    return data
