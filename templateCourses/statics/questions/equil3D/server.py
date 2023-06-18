import random

import numpy as np
from numpy import linalg as LA


def generate(data):

    # Randomize car geometry

    m = random.choice([2, 3, 4, 5, 6, 7, 8, 9, 10])
    w = random.randint(10, 50)

    Ax = -2 * m
    Ay = 0
    Az = 3 * m
    Bx = -1 * m
    By = 0
    Bz = -3 * m
    Cx = 3 * m
    Cy = 0
    Cz = -2 * m
    Dx = 0
    Dy = 6 * m
    Dz = 0

    rad = [(Dx - Ax), (Dy - Ay), (Dz - Az)]
    Vad = LA.norm(rad)
    uad = rad / Vad

    rbd = [(Dx - Bx), (Dy - By), (Dz - Bz)]
    Vbd = LA.norm(rbd)
    ubd = rbd / Vbd

    rcd = [(Dx - Cx), (Dy - Cy), (Dz - Cz)]
    Vcd = LA.norm(rcd)
    ucd = rcd / Vcd

    a = np.array(
        [[uad[0], ubd[0], ucd[0]], [uad[1], ubd[1], ucd[1]], [uad[2], ubd[2], ucd[2]]]
    )
    b = np.array([0, w, 0])
    F = np.linalg.solve(a, b)
    Fad = F[0]
    Fbd = F[1]
    Fcd = F[2]

    data["params"]["Ax"] = Ax
    data["params"]["Ay"] = Ay
    data["params"]["Az"] = Az
    data["params"]["Bx"] = Bx
    data["params"]["By"] = By
    data["params"]["Bz"] = Bz
    data["params"]["Cx"] = Cx
    data["params"]["Cy"] = Cy
    data["params"]["Cz"] = Cz
    data["params"]["Dx"] = Dx
    data["params"]["Dy"] = Dy
    data["params"]["Dz"] = Dz
    data["params"]["w"] = w
    data["correct_answers"]["Fad"] = Fad
    data["correct_answers"]["Fbd"] = Fbd
    data["correct_answers"]["Fcd"] = Fcd

    return data
