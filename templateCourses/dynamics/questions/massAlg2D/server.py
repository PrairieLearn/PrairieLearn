import io
import random
import numpy as np
from matplotlib import pyplot as plt
from sympy import *


def generate(data):
    x1 = random.randint(-2, 1)
    x2 = random.randint(x1 + 1, 2)

    def randPoly():
        b = random.randint(-2, 2)
        a = randIntNonZero(-2, 2)
        c = 0
        if a > 0:
            c = random.randint(1, 3)
        else:
            cMax = max(1 - a * (x1 - b) ** 2, 1 - a * (x2 - b) ** 2)
            c = random.randint(cMax, cMax + 2)

        return [a * b * b + c, -2 * a * b, a]

    p1 = randPoly()
    p2 = randPoly()
    while (p2[0] == p1[0] and p2[1] == p1[1]) or (p2[0] == -p1[0] and p2[1] == -p1[1]):
        p2 = randPoly()

    p1 = -np.array(p1)
    p1 = p1.tolist()

    rho = random.randint(2, 9)

    p1.reverse()
    p2.reverse()

    p1Int = np.polyint(p1)
    p2Int = np.polyint(p2)

    p1IntDef = np.polyval(p1Int, x2) - np.polyval(p1Int, x1)
    p2IntDef = np.polyval(p2Int, x2) - np.polyval(p2Int, x1)

    m = rho * (p2IntDef - p1IntDef)

    x = symbols("x")

    data["params"]["rho"] = rho
    data["params"]["x1"] = x1
    data["params"]["x2"] = x2
    data["params"]["y1latex"] = latex(p1[0] * x**2 + p1[1] * x + p1[2])
    data["params"]["y2latex"] = latex(p2[0] * x**2 + p2[1] * x + p2[2])
    data["params"]["y1"] = str(p1[0] * x**2 + p1[1] * x + p1[2])
    data["params"]["y2"] = str(p2[0] * x**2 + p2[1] * x + p2[2])
    data["params"]["A1"] = p1[0]
    data["params"]["A2"] = p2[0]
    data["params"]["B1"] = p1[1]
    data["params"]["B2"] = p2[1]
    data["params"]["C1"] = p1[2]
    data["params"]["C2"] = p2[2]

    data["correct_answers"]["m"] = m

    return data


def file(data):
    x = symbols("x")

    A1 = data["params"]["A1"]
    A2 = data["params"]["A2"]
    B1 = data["params"]["B1"]
    B2 = data["params"]["B2"]
    C1 = data["params"]["C1"]
    C2 = data["params"]["C2"]

    y1 = A1 * x**2 + B1 * x + C1
    y2 = A2 * x**2 + B2 * x + C2

    x1 = data["params"]["x1"]
    x2 = data["params"]["x2"]

    t = np.linspace(x1, x2, 100)

    x_axis = np.zeros(len(t))
    y1_axis = np.zeros(len(t))
    y2_axis = np.zeros(len(t))

    for i in range(len(t)):
        x_axis[i] = t[i]
        y1_axis[i] = y1.subs(x, t[i])
        y2_axis[i] = y2.subs(x, t[i])
    mins = [min(y1_axis), min(y2_axis)]
    maxs = [max(y1_axis), max(y2_axis)]
    extrema = mins + maxs
    extrema = abs(np.array(extrema))

    fig, ax = plt.subplots(figsize=(4, 4))
    ax.plot(x_axis, y1_axis, "k-", linewidth=2)
    ax.plot(x_axis, y2_axis, "k-", linewidth=2)
    ax.vlines(x1, y1_axis[0], y2_axis[0], linewidth=2, color="black")
    ax.vlines(x2, y1_axis[len(t) - 1], y2_axis[len(t) - 1], linewidth=2, color="black")
    ax.set_xlim([-2.5, 2.5])
    ax.set_ylim([-max(extrema) - 1, max(extrema) + 1])
    ax.spines["bottom"].set_position(("data", 0))
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_position(("data", 0))
    ax.set_ylabel("y", loc="top", size="xx-large", rotation="horizontal")
    ax.set_xlabel("x", loc="right", size="xx-large")
    ax.set_yticks([])
    ax.set_xticks(np.linspace(-2, 2, 5))
    ax.fill_between(x_axis, y1_axis, y2_axis, color="#F0F0F0")

    buf = io.BytesIO()
    fig.savefig(buf, format="png")

    return buf

def randIntNonZero(a, b):
    """a: lower bound of the range of integers
       b: upper bound of the range of integers
    returns a non-zero integer in the range [a,b]
    """

    x = 0
    while x == 0:
        x = random.randint(a, b)

    return x
