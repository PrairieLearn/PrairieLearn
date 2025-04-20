import random


def generate(data):
    V = random.randint(12, 40)
    data["params"]["V"] = V

    R = random.sample([10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82], 2)
    data["params"]["R1"] = R[0]
    data["params"]["R2"] = R[1]

    C = random.randint(5, 15)
    data["params"]["C"] = C

    # total energy
    data["correct_answers"]["charge"] = C * V

    # data for plotting
    pA = [60, 60]
    L = 300
    h = 120

    pB = [pA[0] + L / 2, pA[1]]
    pC = [pA[0] + L, pA[1]]
    pD = [pA[0] + L, pA[1] + h]
    pE = [pA[0] + 4 / 5 * L, pA[1] + h]
    pF = [pA[0], pA[1] + h]
    pG = [pA[0] + 1 / 5 * L, pB[1] + h]
    pH = [pE[0], pE[1] - h / 4]
    pI = [pE[0], pE[1] + h / 4]
    pJ = [pG[0], pG[1] - h / 4]
    pK = [pG[0], pG[1] + h / 4]
    pL = [pF[0] + L / 2, pG[1] - h / 4]

    data["params"]["pA"] = pA
    data["params"]["pB"] = pB
    data["params"]["pC"] = pC
    data["params"]["pD"] = pD
    data["params"]["pE"] = pE
    data["params"]["pF"] = pF
    data["params"]["pG"] = pG
    data["params"]["pH"] = pH
    data["params"]["pI"] = pI
    data["params"]["pJ"] = pJ
    data["params"]["pK"] = pK
    data["params"]["pL"] = pL
