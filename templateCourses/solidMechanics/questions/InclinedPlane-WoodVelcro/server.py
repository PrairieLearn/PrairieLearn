import math
import random


def generate(data):

    b = random.randint(1, 2)
    h = random.randint(3, 7)
    alphaDeg = random.randint(10, 60)
    thetaRad = math.radians(90 - alphaDeg)
    sm = random.randint(1, 2)
    tm = random.randint(6, 9)

    Ps = sm * h * b / math.pow(math.cos(thetaRad), 2)
    Pt = tm * h * b / (math.cos(thetaRad) * math.sin(thetaRad))

    # console.log("Pt = ",Pt);
    # console.log("Ps = ",Ps);

    P = Ps
    if Ps > Pt:
        P = Pt

    data["params"]["b"] = b
    data["params"]["h"] = h
    data["params"]["sm"] = sm
    data["params"]["tm"] = tm
    data["params"]["alphaDeg"] = alphaDeg

    data["correct_answers"]["P"] = P

    return data
