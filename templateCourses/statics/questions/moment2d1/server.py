import random

import numpy as np


def generate(data):

    # Randomize car geometry
    m = random.randint(2, 5)
    w = m * 9.81

    Sx = random.randint(16, 22)
    Sy = random.randint(120, 140)
    Ex = Sx + random.randint(31, 37)
    Ey = Sy
    Wx = Ex
    Wy = Sy - random.randint(27, 33)

    r = (Ex - Sx, 0, 0)
    F = (0, -w, 0)

    M = np.cross(r, F)

    Mx = M[0]
    My = M[1]
    Mz = M[2]

    data["params"]["Sx"] = Sx
    data["params"]["Sy"] = Sy

    data["params"]["Ex"] = Ex
    data["params"]["Ey"] = Ey

    data["params"]["Wx"] = Wx
    data["params"]["Wy"] = Wy
    data["params"]["m"] = m

    data["correct_answers"]["Mx"] = Mx
    data["correct_answers"]["My"] = My
    data["correct_answers"]["Mz"] = Mz

    return data
