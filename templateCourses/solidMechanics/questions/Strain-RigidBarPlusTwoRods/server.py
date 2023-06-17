import math
import random

import numpy as np


def generate(data):
    h = random.randint(200, 300)
    a = random.randint(180, 250)
    deltaC = 1.5

    # Canvas
    width = 500
    height = 500

    # Origin
    rA = np.array([width / 5, 0.7 * height])
    Ax = rA[0]
    Ay = rA[1]

    # Rigid rod points
    adraw = width / 5
    hdraw = 0.5 * height
    rB = rA + np.array([adraw, 0])
    rC = rB + np.array([adraw, 0])
    rD = rC + np.array([1.2 * adraw, 0])
    rE = rB - np.array([0, hdraw])
    rF = rC - np.array([0, hdraw])
    Bx = rB[0]
    By = rB[1]
    Cx = rC[0]
    Cy = rC[1]
    Dx = rD[0]
    Dy = rD[1]
    Ex = rE[0]
    Ey = rE[1]
    Fx = rF[0]
    Fy = rF[1]

    # Text label location
    label_1 = rB + 0.5 * (rE - rB)
    label_2 = rC + 0.5 * (rF - rC)
    label_1x = label_1[0]
    label_1y = label_1[1]
    label_2x = label_2[0]
    label_2y = label_2[1]
    data["params"]["label_1x"] = label_1x
    data["params"]["label_1y"] = label_1y
    data["params"]["label_2x"] = label_2x
    data["params"]["label_2y"] = label_2y

    # Answer
    epsilon = 1000 * deltaC / (2 * h)

    data["params"]["h"] = h
    data["params"]["a"] = a
    data["params"]["deltaC"] = deltaC
    data["params"]["width"] = width
    data["params"]["height"] = height
    data["params"]["Ax"] = Ax
    data["params"]["Ay"] = Ay
    data["params"]["Bx"] = Bx
    data["params"]["By"] = By
    data["params"]["Cx"] = Cx
    data["params"]["Cy"] = Cy
    data["params"]["Dx"] = Dx
    data["params"]["Dy"] = Dy
    data["params"]["Ex"] = Ex
    data["params"]["Ey"] = Ey
    data["params"]["Fx"] = Fx
    data["params"]["Fy"] = Fy
    data["params"]["adraw"] = adraw
    data["params"]["hdraw"] = hdraw

    data["correct_answers"]["epsilon"] = epsilon

    return data
