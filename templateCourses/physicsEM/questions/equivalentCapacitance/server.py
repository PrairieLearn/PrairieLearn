import math
import random


def generate(data):

    V = 12
    data["params"]["V"] = str(V) + "V"

    # randomized values for capacitors
    Cs = random.sample(range(5, 9), 3)
    Clist = [2, 0, 0, 3, 4, 0]
    for i, c in enumerate([1, 2, 5]):
        Clist[c] = random.choice([0, Cs[i]])
    # Clist = [6,4,1,3,2,4]
    for i in range(0, 6):
        data["params"][f"C{i}"] = f"{Clist[i]}\\\mu F"

    # Computing equivalent capacitance
    if Clist[2] != 0:
        Ceq1 = (1 / Clist[2] + 1 / Clist[3]) ** (-1)
    else:
        Ceq1 = Clist[3]

    if Clist[5] != 0:
        Ceq2 = (1 / Clist[4] + 1 / Clist[5]) ** (-1)
    else:
        Ceq2 = Clist[4]
    Ceq3 = Ceq1 + Ceq2
    if Clist[1] != 0:
        C2inv = 1 / Clist[1]
    else:
        C2inv = 0

    Ceq = (1 / Clist[0] + C2inv + 1 / Ceq3) ** (-1)
    data["correct_answers"]["Ceq"] = Ceq

    # charge
    Qt = Ceq * V
    choice = random.choice([3, 4])
    data["params"]["choice"] = f"{Clist[choice]}\\mu F"
    Q23 = Qt * Ceq1 / (Ceq1 + Ceq2)
    Q45 = Qt * Ceq2 / (Ceq1 + Ceq2)
    if choice == 3:
        data["correct_answers"]["charge"] = Q23
    else:
        data["correct_answers"]["charge"] = Q45

    # total energy
    data["correct_answers"]["energytotal"] = 0.5 * Ceq * V**2

    # energy at capacitor
    choice2 = 0
    data["params"]["choice2"] = f"{Clist[choice2]}\\mu F"
    V0 = Qt / Clist[0]
    E = 0.5 * Clist[0] * V0**2
    data["correct_answers"]["energy0"] = E

    ################################
    ## data for plotting
    ################################
    pA = [60, 60]
    L = 300
    h = 120

    pB = [pA[0] + L / 2, pA[1]]
    pC = [pA[0] + L, pA[1]]
    pD = [pA[0] + L, pA[1] + h]
    pE = [pA[0] + L / 2, pA[1] + h]
    pF = [pA[0], pA[1] + h]
    pG = [pB[0], pB[1] + h / 2]
    pH = [pC[0], pC[1] + h / 2]

    data["params"]["pA"] = pA
    data["params"]["pB"] = pB
    data["params"]["pC"] = pC
    data["params"]["pD"] = pD
    data["params"]["pE"] = pE
    data["params"]["pF"] = pF
    data["params"]["pG"] = pG
    data["params"]["pH"] = pH

    line1 = html_line(pA, pB, Clist[0])
    line2 = html_line(pF, pE, Clist[1])
    line3 = html_line(pG, pB, Clist[2])
    line6 = html_line(pD, pH, Clist[5])

    data["params"]["randomItems"] = line1 + line2 + line3 + line6


def html_line(p1, p2, C):
    if C == 0:
        line = f"<pl-line x1={p1[0]} y1={p1[1]} x2={p2[0]}  y2={p2[1]} ></pl-line>"
    else:
        line = f'<pl-capacitor x1={p2[0]} y1={p2[1]} x2={p1[0]}  y2={p1[1]}  label="{C}\\\mu F" offsetx="20" offsety="20"></pl-capacitor>'
    return line
