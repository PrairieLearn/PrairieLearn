import random

import numpy as np


def generate(data):
    which3 = random.choice([0, 1])
    whichA = random.choice([0, 1])
    whichB = random.choice([0, 1])
    whichC = random.choice([0, 1])
    w = random.randint(5, 10)
    m = random.randint(2, 10)
    Ax = 0
    Ay = 4 * m
    Az = 0
    Bx = 1 * m
    By = 0
    Bz = -3 * m
    Cx = -3 * m
    Cy = 0
    Cz = -2 * m
    Dx = -1 * m
    Dy = 0
    Dz = 5 * m
    data["params"]["point1"] = "A"
    data["params"]["point2"] = "B"
    data["params"]["point3"] = "C"
    data["params"]["point4"] = "D"
    data["params"]["point1x"] = Ax
    data["params"]["point1y"] = Ay
    data["params"]["point1z"] = Az
    data["params"]["point2x"] = Bx
    data["params"]["point2y"] = By
    data["params"]["point2z"] = Bz
    data["params"]["point3x"] = Cx
    data["params"]["point3y"] = Cy
    data["params"]["point3z"] = Cz
    data["params"]["point4x"] = Dx
    data["params"]["point4y"] = Dy
    data["params"]["point4z"] = Dz
    data["params"]["weight"] = w

    if whichA == 0:
        data["params"]["vec1"] = "AB"
        vec1_pre = np.array([Bx - Ax, By - Ay, Bz - Az])
    elif whichA == 1:
        data["params"]["vec1"] = "BA"
        vec1_pre = np.array([Ax - Bx, Ay - By, Az - Bz])

    if whichB == 0:
        data["params"]["vec2"] = "AC"
        vec2_pre = np.array([Cx - Ax, Cy - Ay, Cz - Az])
    elif whichB == 1:
        data["params"]["vec2"] = "CA"
        vec2_pre = np.array([Ax - Cx, Ay - Cy, Az - Cz])

    if whichC == 0:
        data["params"]["vec3"] = "AD"
        vec3_pre = np.array([Dx - Ax, Dy - Ay, Dz - Az])
    elif whichC == 1:
        data["params"]["vec3"] = "DA"
        vec3_pre = np.array([Ax - Dx, Ay - Dy, Az - Dz])

    # Put these two integers into data['params']
    vec1_hat = vec1_pre / np.linalg.norm(vec1_pre)
    vec2_hat = vec2_pre / np.linalg.norm(vec2_pre)
    vec3_hat = vec3_pre / np.linalg.norm(vec3_pre)

    a = np.array(
        [
            [vec1_hat[0], vec2_hat[0], vec3_hat[0]],
            [vec1_hat[1], vec2_hat[1], vec3_hat[1]],
            [vec1_hat[2], vec2_hat[2], vec3_hat[2]],
        ]
    )
    b = np.array([0, w, 0])
    F = np.linalg.solve(a, b)
    vec1_mag = abs(F[0])
    vec2_mag = abs(F[1])
    vec3_mag = abs(F[2])

    data["correct_answers"]["vec1_mag"] = vec1_mag
    data["correct_answers"]["vec2_mag"] = vec2_mag
    data["correct_answers"]["vec3_mag"] = vec3_mag

    return data
