import random

import numpy as np


def generate(data):
    figurelist = ["Variant1.PNG", "Variant2.PNG", "Variant3.PNG"]
    which2 = random.choice([0, 1, 2])
    figure = figurelist[which2]
    which3 = random.choice([0, 1])
    mag1 = random.randint(5, 10)
    mag2 = random.randint(5, 10)
    data["params"]["mag1"] = mag1
    data["params"]["mag2"] = mag2
    Ax = random.randint(5, 10)
    Ay = random.randint(5, 10)
    Az = random.randint(5, 10)
    Bx = random.randint(5, 10)
    By = random.randint(5, 10)
    Bz = random.randint(5, 10)
    Cx = random.randint(5, 10)
    Cy = random.randint(5, 10)
    Cz = random.randint(5, 10)
    Dx = random.randint(5, 10)
    Dy = random.randint(5, 10)
    Dz = random.randint(5, 10)

    if which2 == 0:
        data["params"]["point1"] = "A"
        data["params"]["point2"] = "B"
        data["params"]["point3"] = "C"
        data["params"]["point1x"] = Ax
        data["params"]["point1y"] = Ay
        data["params"]["point1z"] = Az
        data["params"]["point2x"] = Bx
        data["params"]["point2y"] = By
        data["params"]["point2z"] = Bz
        data["params"]["point3x"] = Cx
        data["params"]["point3y"] = Cy
        data["params"]["point3z"] = Cz
        if which3 == 0:
            data["params"]["vec1"] = "AB"
            data["params"]["vec2"] = "AC"
            vec1_pre = np.array([Bx - Ax, By - Ay, Bz - Az])
            vec2_pre = np.array([Cx - Ax, Cy - Ay, Cz - Az])
        elif which3 == 1:
            data["params"]["vec1"] = "BA"
            data["params"]["vec2"] = "CA"
            vec1_pre = np.array([Ax - Bx, Ay - By, Az - Bz])
            vec2_pre = np.array([Ax - Cx, Ay - Cy, Az - Cz])
    elif which2 == 1:
        data["params"]["point1"] = "A"
        data["params"]["point2"] = "B"
        data["params"]["point3"] = "D"
        data["params"]["point1x"] = Ax
        data["params"]["point1y"] = Ay
        data["params"]["point1z"] = Az
        data["params"]["point2x"] = Bx
        data["params"]["point2y"] = By
        data["params"]["point2z"] = Bz
        data["params"]["point3x"] = Dx
        data["params"]["point3y"] = Dy
        data["params"]["point3z"] = Dz
        if which3 == 0:
            data["params"]["vec1"] = "AB"
            data["params"]["vec2"] = "AD"
            vec1_pre = np.array([Bx - Ax, By - Ay, Bz - Az])
            vec2_pre = np.array([Dx - Ax, Dy - Ay, Dz - Az])
        elif which3 == 1:
            data["params"]["vec1"] = "BA"
            data["params"]["vec2"] = "DA"
            vec1_pre = np.array([Ax - Bx, Ay - By, Az - Bz])
            vec2_pre = np.array([Ax - Dx, Ay - Dy, Az - Dz])
    elif which2 == 2:
        data["params"]["point1"] = "A"
        data["params"]["point2"] = "C"
        data["params"]["point3"] = "D"
        data["params"]["point1x"] = Ax
        data["params"]["point1y"] = Ay
        data["params"]["point1z"] = Az
        data["params"]["point2x"] = Cx
        data["params"]["point2y"] = Cy
        data["params"]["point2z"] = Cz
        data["params"]["point3x"] = Dx
        data["params"]["point3y"] = Dy
        data["params"]["point3z"] = Dz
        if which3 == 0:
            data["params"]["vec1"] = "AC"
            data["params"]["vec2"] = "AD"
            vec1_pre = np.array([Cx - Ax, Cy - Ay, Cz - Az])
            vec2_pre = np.array([Dx - Ax, Dy - Ay, Dz - Az])
        elif which3 == 1:
            data["params"]["vec1"] = "CA"
            data["params"]["vec2"] = "DA"
            vec1_pre = np.array([Ax - Cx, Ay - Cy, Az - Cz])
            vec2_pre = np.array([Ax - Dx, Ay - Dy, Az - Dz])

    # Put these two integers into data['params']
    vec1_hat = vec1_pre / np.linalg.norm(vec1_pre)
    vec1_all = mag1 * vec1_hat

    vec2_hat = vec2_pre / np.linalg.norm(vec2_pre)
    vec2_all = mag2 * vec2_hat

    data["params"]["fig"] = figure

    proj = (np.dot(vec1_all, vec2_all) / np.dot(vec2_all, vec2_all)) * vec2_all
    data["correct_answers"]["proj_ix"] = proj[0]
    data["correct_answers"]["proj_iy"] = proj[1]
    data["correct_answers"]["proj_iz"] = proj[2]
    # data['correct_answers']['proj'] = pl.to_json(proj.reshape(1,3))

    return data
