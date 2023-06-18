import random

import numpy as np


def generate(data):

    # Randomize car geometry

    a1 = random.randint(7, 9)
    a2 = random.randint(2, 3)
    a3 = random.randint(6, 7)

    b1 = random.randint(5, 6)
    b2 = random.randint(3, 4)
    b3 = random.randint(1, 2)

    A = (a1, a2, a3)
    B = (-b1, b2, b3)
    r = np.subtract(B, A)
    ur = r / np.linalg.norm(r)

    f = random.randint(60, 110)
    F = f * ur

    # random unit vector
    phi = np.random.uniform(0, np.pi * 2)
    costheta = np.random.uniform(-1, 1)

    theta = np.arccos(costheta)

    x = np.sin(theta) * np.cos(phi)
    y = np.sin(theta) * np.sin(phi)
    z = np.cos(theta)

    uv = (x, y, z)
    uvx = uv[0]
    uvy = uv[1]
    uvz = uv[2]

    uvx = format(uvx, ".4f")
    uvy = format(uvy, ".4f")
    uvz = format(uvz, ".4f")
    m = np.linalg.norm(uv)

    Mo = np.cross(A, F)
    Ma = np.dot(uv, Mo)

    Mx = Ma * uv[0]
    My = Ma * uv[1]
    Mz = Ma * uv[2]

    data["params"]["a1"] = a1
    data["params"]["a2"] = a2
    data["params"]["a3"] = a3

    data["params"]["b1"] = b1
    data["params"]["b2"] = b2
    data["params"]["b3"] = b3

    data["params"]["uvx"] = uvx
    data["params"]["uvy"] = uvy
    data["params"]["uvz"] = uvz

    data["params"]["f"] = f

    data["correct_answers"]["Mx"] = Mx
    data["correct_answers"]["My"] = My
    data["correct_answers"]["Mz"] = Mz

    return data
