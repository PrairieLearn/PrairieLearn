import math
import random


def generate(data):

    h = random.randint(100, 120)
    b = random.randint(100, 120)
    e1 = random.randint(150, 200)
    e2 = random.randint(100, 250)
    w = random.randint(50, 100)
    d = random.randint(10, 30)
    L1 = math.sqrt(math.pow(h, 2) + math.pow(b, 2))
    L2 = math.sqrt(math.pow(h, 2) + math.pow(2 * b, 2))
    sint1 = h / L1
    sint2 = h / L2
    ratiodelta = sint1 / (2 * sint2)
    # console.log("ratio delta = ", ratiodelta)
    A = math.pi * math.pow(d, 2) / 4
    f1 = L1 / (e1 * A)
    f2 = L2 / (e2 * A)
    # console.log("f1 = ", f1)
    # console.log("f2 = ", f2)
    ratioF = ratiodelta * f2 / f1
    # console.log("ratio F = ", ratioF)
    den = 2 * (ratioF * sint1 + 2 * sint2)
    F2 = 3 * w / den
    F1 = 3 * ratioF * w / den
    sigma1 = F1 / A
    sigma2 = F2 / A
    # console.log("sigma1 = ", sigma1)
    # console.log("sigma2 = ", sigma2)

    data["params"]["h"] = h
    data["params"]["b"] = b
    data["params"]["d"] = d
    data["params"]["w"] = w
    data["params"]["e1"] = e1
    data["params"]["e2"] = e2

    data["correct_answers"]["ratiodelta"] = ratiodelta
    data["correct_answers"]["ratioF"] = ratioF
    data["correct_answers"]["f1"] = f1
    data["correct_answers"]["f2"] = f2
    data["correct_answers"]["sigma1"] = sigma1
    data["correct_answers"]["sigma2"] = sigma2

    return data
