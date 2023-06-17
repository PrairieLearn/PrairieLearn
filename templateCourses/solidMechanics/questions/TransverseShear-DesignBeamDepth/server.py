import math
import random


def generate(data):
    b = random.randint(50, 100)
    a = random.randint(600, 800)
    tau = random.randint(60, 80)
    sigma = random.randint(100, 200)

    P = random.randint(6, 15)

    imgFile = random.choice(["Loading1.png", "Loading2.png", "Loading3.png"])

    V = 0
    M = 0
    load = " "
    unit = " "

    if imgFile == "Loading1.png":
        V = 1000 * P / 2
        M = 1000 * P * a / 2
        load = "P"
        unit = "kN"
    if imgFile == "Loading2.png":
        V = 1000 * P
        M = 1000 * P * a
        load = "P"
        unit = "kN"
    if imgFile == "Loading3.png":
        V = P * a / 2
        M = P * a * a / 8
        load = "w"
        unit = "kN/m"

    h1 = math.sqrt(6 * M / (b * sigma))
    h2 = 3 * V / (2 * b * tau)

    h = h1
    limit = "maximum normal stress"
    if h2 > h:
        h = h2
        limit = "maximum shear stress"

    # console.log(h1,h2)

    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["imgFile"] = imgFile
    data["params"]["P"] = P
    data["params"]["load"] = load
    data["params"]["unit"] = unit
    data["params"]["sigma"] = sigma
    data["params"]["tau"] = tau
    data["params"]["limit"] = limit

    data["correct_answers"]["h"] = h

    return data
