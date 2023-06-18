import io
import random

import numpy as np
from matplotlib import pyplot as plt
from sympy import *


def generate(data):
    theta = symbols("theta")

    C = random.randint(3, 4)
    A = randIntNonZero(-2, 2)
    B = random.choice([-1, 1]) * random.randint(3, 5)
    D = random.randint(1, 5)

    func_type = random.choice(["sin", "cos"])

    theta_val = random.choice([-4, -3, -2, -1, 1, 2, 3, 4])
    omega = random.choice([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5])

    if func_type == "sin":
        r = C + A * sin(B * theta + D)
    else:
        r = C + A * cos(B * theta + D)

    er = Matrix([cos(theta_val), sin(theta_val)])
    etheta = Matrix([-sin(theta_val), cos(theta_val)])

    rprime = diff(r, theta)
    rdot = rprime.subs(theta, theta_val) * omega
    r_val = r.subs(theta, theta_val)

    v = (rdot * er + r_val * omega * etheta).evalf()

    data["params"]["A"] = A
    data["params"]["B"] = B
    data["params"]["C"] = C
    data["params"]["D"] = D
    data["params"]["func_type"] = func_type
    data["params"]["theta"] = theta_val
    data["params"]["rlatex"] = latex(r)
    data["params"]["r"] = str(r)
    data["params"]["omega"] = omega

    data["correct_answers"]["vx"] = float(v[0])
    data["correct_answers"]["vy"] = float(v[1])

    return data


def file(data):
    theta = symbols("theta")

    A = data["params"]["A"]
    B = data["params"]["B"]
    C = data["params"]["C"]
    D = data["params"]["D"]
    theta_val = data["params"]["theta"]
    func_type = data["params"]["func_type"]

    if func_type == "sin":
        r = C + A * sin(B * theta + D)
    else:
        r = C + A * cos(B * theta + D)

    r_val = r.subs(theta, theta_val)
    t = np.linspace(0, 2 * np.pi, 100)
    theta_axis = np.zeros(len(t))
    r_axis = np.zeros(len(t))
    for i in range(len(t)):
        theta_axis[i] = t[i]
        r_axis[i] = r.subs(theta, t[i])
    fig, ax = plt.subplots(subplot_kw={"projection": "polar"})
    ax.plot(theta_axis, r_axis, "k-")
    ax.set_rticks([])
    ax.set_thetagrids([])
    ax.scatter(theta_val, r_val, c="k", s=10)
    ax.scatter(0, 0, c="k", s=10)
    ax.spines["polar"].set_visible(False)
    ax.text(x=0.2, y=0.2, s="O", fontsize=20)
    ax.text(x=theta_val + 0.2, y=r_val + 0.2, s="P", fontsize=20)

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
