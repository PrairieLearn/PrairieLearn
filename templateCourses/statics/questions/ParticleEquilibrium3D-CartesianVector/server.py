import math
import random

import numpy as np


def generate(data):

    #######Jaekwang is writing new

    choice = random.choice([1, 2, 3])

    a1 = random.randint(7, 9)
    a2 = random.randint(2, 3)
    b1 = 2
    b2 = 2
    c1 = 3
    c2 = 4
    W = random.randint(200, 600)

    #### Test
    # a1 = 7
    # a2 = 2
    # b1 = 2
    # b2 = 2
    # c1 = 4
    # c2 = 4
    # W = 363

    # convert to dimensions shown if the figure
    # a=a1
    # b=a2
    # c=b1
    # d=b2
    # e=c1
    # f=c2

    data["params"]["a1"] = a1
    data["params"]["a2"] = a2
    data["params"]["b1"] = b1
    data["params"]["b2"] = b2
    data["params"]["c1"] = c1
    data["params"]["c2"] = c2

    data["params"]["a"] = a1
    data["params"]["b"] = a2
    data["params"]["c"] = b1
    data["params"]["d"] = b2
    data["params"]["e"] = c1
    data["params"]["f"] = c2
    data["params"]["W"] = W

    rA = np.array([a1, 0, a2])
    rB = np.array([0, b1, 0])
    rC = np.array([-c1, 0, c2])
    rD = np.array([0, b1 + b2, 0])

    rBA = rA - rB
    rBC = rC - rB
    rBD = rD - rB

    magBA = (sum((rBA) ** 2)) ** (1 / 2)
    magBC = (sum((rBC) ** 2)) ** (1 / 2)
    magBD = (sum((rBD) ** 2)) ** (1 / 2)

    Tbf = (b1 * (a1 + c1) * W) / (a2 * c1 + a1 * c2)
    Tba = (c1 * W * math.sqrt(a1 * a1 + a2 * a2 + b1 * b1)) / (a2 * c1 + a1 * c2)
    Tbc = (a1 * W * math.sqrt(b1 * b1 + c1 * c1 + c2 * c2)) / (a2 * c1 + a1 * c2)

    Tvec_BA = rBA * (Tba / magBA)
    Tvec_BD = rBD * (Tbf / magBD)
    Tvec_BC = rBC * (Tbc / magBC)

    if choice == 1:
        Tvec = Tvec_BA
        optionLine = "BA"
    elif choice == 2:
        Tvec = Tvec_BD
        optionLine = "BD"
    elif choice == 3:
        Tvec = Tvec_BC
        optionLine = "BC"

    data["params"]["optionLine"] = optionLine

    data["correct_answers"]["Tvec_x"] = Tvec[0]
    data["correct_answers"]["Tvec_y"] = Tvec[1]
    data["correct_answers"]["Tvec_z"] = Tvec[2]
