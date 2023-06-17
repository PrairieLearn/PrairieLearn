import math
import random


def generate(data):

    a = random.randint(1500, 2000)
    h = random.randint(140, 160)
    t2 = random.randint(20, 25)
    t1 = random.randint(20, 25)
    b = random.randint(230, 250)
    sigmaT = random.randint(10, 16)
    sigmaC = random.randint(10, 16)

    ybar = ((b * t2) * (h + t2 / 2) + 2 * t1 * h * h / 2) / (b * t2 + 2 * h * t1)

    Iz = (
        b * math.pow(t2, 3) / 12
        + (b * t2) * math.pow(h + t2 / 2 - ybar, 2)
        + 2 * (t1 * math.pow(h, 3) / 12 + (t1 * h) * math.pow(h / 2 - ybar, 2))
    )
    Izz = math.pow(10, -6) * Iz
    imgFile = "Picture1"

    beta = 2 * Iz / (a * a)
    yt = h + t2 - ybar
    yb = ybar

    wmax1 = beta * sigmaC / (yt)
    wmax2 = beta * sigmaT / (yb)
    wmax3 = beta * sigmaC / (3 * yb)
    wmax4 = beta * sigmaT / (3 * yt)

    # console.log(wmax1,wmax2,wmax3,wmax4)
    w = wmax1
    if wmax2 < w:
        w = wmax2
    if wmax3 < w:
        w = wmax3
    if wmax4 < w:
        w = wmax4
    # console.log(w)

    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["imgFile"] = imgFile
    data["params"]["h"] = h
    data["params"]["t1"] = t1
    data["params"]["t2"] = t2
    data["params"]["sigmaT"] = sigmaT
    data["params"]["sigmaC"] = sigmaC

    data["correct_answers"]["Iz"] = Izz
    data["correct_answers"]["yb"] = yb
    data["correct_answers"]["w"] = w

    return data
