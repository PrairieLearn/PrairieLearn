import random

import numpy as np


def generate(data):
    T1C = random.randint(850, 950)  # temperature in Celsius
    T1 = T1C + 273
    # convert it to Kelvin

    ener = 0.01 * random.randint(180, 220)  # energy necessary to create vacancy in ev
    ev = 1.602176e-19  # in Joules
    k = 1.38064852e-23  # Boltzmann constant

    N1 = 10000  # number of atoms corresponding to T1
    N2 = 1000  # number of atoms corresponding to T2

    T2inv = 1 / (T1) - (k * np.log(N1 / N2)) / (ener * ev)
    T2 = 1 / T2inv  # temperature in Kelvin
    T2C = T2 - 273  # temperature in Celsius

    data["params"]["T1C"] = T1C
    data["params"]["ener"] = ener
    data["params"]["N1"] = N1
    data["params"]["N2"] = N2
    data["correct_answers"]["T2C"] = T2C
