import math
import random


def generate(data):

    # Randomize car geometry

    alpha = random.randint(10, 50)
    e = random.randint(2, 4)
    b = 0.4
    a = round(e * 100 * 0.5) / 100
    c = round(b * 100 * 1.2) / 100
    d = round(e * 100 * 0.8) / 100

    f1 = random.randint(20, 40)
    f2 = random.randint(20, 30)

    alpharad = alpha / 180 * math.pi

    Fx = f1 + (f2 * (math.sin(alpharad)))
    Fy = -f2 * (math.cos(alpharad))
    Fz = 0

    m1 = -f1 * a
    m2 = -f2 * ((math.sin(alpharad)) * d + (math.cos(alpharad)) * c)
    mz = m1 + m2
    mx = 0
    my = 0

    data["params"]["alpha"] = alpha
    data["params"]["e"] = e
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c
    data["params"]["d"] = d
    data["params"]["f1"] = f1
    data["params"]["f2"] = f2

    data["correct_answers"]["Fx"] = Fx
    data["correct_answers"]["Fy"] = Fy
    data["correct_answers"]["Fz"] = Fz
    data["correct_answers"]["mx"] = mx
    data["correct_answers"]["my"] = my
    data["correct_answers"]["mz"] = mz

    return data
