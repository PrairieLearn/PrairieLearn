import random

import numpy as np


def generate(data):

    pA = [20, 160]
    L = 120
    h = 80

    pB = [pA[0] + L, pA[1]]
    pC = [pA[0] + 2 * L, pA[1]]
    pD = [pA[0] + 3 * L, pA[1]]
    pE = [pB[0], pB[1] + h]
    pF = [pB[0], pB[1] - h]
    pG = [pC[0], pC[1] + h]
    pH = [pC[0], pC[1] - h]

    data["params"]["pA"] = pA
    data["params"]["pB"] = pB
    data["params"]["pC"] = pC
    data["params"]["pD"] = pD
    data["params"]["pE"] = pE
    data["params"]["pF"] = pF
    data["params"]["pG"] = pG
    data["params"]["pH"] = pH

    # define value of each capacitor
    a = round(random.choice(np.linspace(5, 15, num=11)), 1)  # microF
    b = round(random.choice(np.linspace(1, 5, num=9)), 1)  # microF
    c = round(random.choice(np.linspace(1, 5, num=9)), 1)  # microF
    d = round(random.choice(np.linspace(0.1, 1, num=10)), 1)  # microF

    line0 = html_line(pA, pB, a)
    config = random.choice([1, 2, 3])

    if config == 3:
        line1 = html_line(pC, pD, d)
        line2 = html_line(pF, pH, b)
        line3 = html_line(pE, pG, c)
        Ctotal_inv = 1 / a + 1 / (b + c) + 1 / d
        C = 1 / Ctotal_inv

    else:
        if random.choice([0, 1]):
            line2 = html_line(pF, pH, 0)
            line3 = html_line(pE, pG, b)
        else:
            line2 = html_line(pF, pH, b)
            line3 = html_line(pE, pG, 0)

        if config == 1:
            line1 = html_line(pC, pD, 0)
            Ctotal_inv = 1 / a + 1 / (b)
            C = 1 / Ctotal_inv

        elif config == 2:
            line1 = html_line(pC, pD, d)
            Ctotal_inv = 1 / a + 1 / (b) + 1 / d
            C = 1 / Ctotal_inv

    data["params"]["randomItems"] = line0 + line1 + line2 + line3
    data["correct_answers"]["C"] = C


def html_line(p1, p2, C):
    if C == 0:
        line = f"<pl-line x1={p1[0]} y1={p1[1]} x2={p2[0]}  y2={p2[1]} ></pl-line>"
    else:
        line = f'<pl-capacitor x1={p2[0]} y1={p2[1]} x2={p1[0]}  y2={p1[1]}  label="{C}\\\mu F" offsetx="10" offsety="25"></pl-capacitor>'
    return line
