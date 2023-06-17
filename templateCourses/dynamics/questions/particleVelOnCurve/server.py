import io
import random

import numpy as np
from matplotlib import pyplot as plt
from sympy import *


def generate(data):
    x = symbols("x")
    vx = random.choice([5, 10, 15, 20])
    xFuncType = random.randint(0, 1)
    if random.choice([True, False]):
        vx = -vx

    func_type = ["sin", "cos"][xFuncType]
    A = random.choice([-2, -1, 1, 2])
    B = random.choice([0.5, 1, 2])

    if np.random.choice([True, False], p=[0.25, 0.75]):
        Q = xFuncType
    else:
        Q = 1 - xFuncType

    xCoeff = random.randint(1, 4 * B - 1) / B + (1 - Q) / (2 * B)

    if func_type == "cos":
        y = A * cos(B * x)
    else:
        y = A * sin(B * x)

    yprime = diff(y, x)

    vy = yprime.subs(x, xCoeff * pi) * vx

    data["params"]["ylatex"] = latex(y)
    data["params"]["y"] = str(y)
    data["params"]["vx"] = vx
    if xCoeff == 1:
        xCoeff_disp = ""
    else:
        xCoeff_disp = xCoeff
    data["params"]["xCoeff_disp"] = xCoeff_disp
    data["params"]["xCoeff"] = xCoeff
    data["params"]["A"] = A
    data["params"]["B"] = B
    data["params"]["func_type"] = func_type

    data["correct_answers"]["vy"] = float(vy)

    return data


def file(data):
    x = symbols("x")

    A = data["params"]["A"]
    B = data["params"]["B"]

    func_type = data["params"]["func_type"]

    if func_type == "sin":
        y = A * sin(B * x)
    else:
        y = A * cos(B * x)

    x_value = float(data["params"]["xCoeff"] * pi)

    y_value = y.subs(x, x_value)

    xMin = 0
    xMax = 4 * np.pi

    yMax = 2
    yMin = -2

    t = np.linspace(xMin, xMax, 100)
    x_axis = np.zeros(len(t))
    y_axis = np.zeros(len(t))

    for i in range(len(t)):
        x_axis[i] = t[i]
        y_axis[i] = y.subs(x, t[i])

    fig, ax = plt.subplots(figsize=(10, 5))
    ax.plot(x_axis, y_axis, "b-", linewidth=2)
    ax.scatter(x_value, y_value, c="k", linewidth=3)
    ax.spines["bottom"].set_position(("data", 0))
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_position(("data", 0))
    ax.set_ylabel("y", loc="top", size="xx-large")
    ax.set_xlabel("x", loc="right", size="xx-large")
    ax.set_xticks(np.arange(np.pi, xMax + np.pi, step=np.pi))
    ax.set_xticklabels(["π", "2π", "3π", "4π"], size="x-large")
    ax.set_yticks(np.arange(-2, 3, step=1))
    ax.set_yticklabels(["-2", "-1", "0", "1", "2"], size="x-large")

    buf = io.BytesIO()
    fig.savefig(buf, format="png")

    return buf
