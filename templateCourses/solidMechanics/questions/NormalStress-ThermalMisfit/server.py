import math
import random


def generate(data):

    E = random.randint(25, 35)
    L = random.randint(10, 15)
    A = random.randint(1, 3)
    alpha = random.randint(5, 8)
    delta = random.randint(1, 3)

    # temperature for the fit
    dt = 10000 * delta / (alpha * L)
    # console.log("Temperature to fit = ",-dt)
    data["params"]["dt"] = dt

    dtf = math.floor(dt)
    deltaT = -random.randint(dtf * 2, dtf * 4)
    if deltaT > 1000:
        deltaT = math.floor(deltaT / 100)
    elif deltaT < 1000:
        deltaT = math.floor(deltaT / 10)
    # deltaT = - math.floor(random.randint(dt/4, dt/2))
    # console.log("Final Temperature = ",-deltaT)

    sigma = -E * (delta * 10 / L) - E * alpha * deltaT * 0.001

    data["params"]["E"] = E
    data["params"]["alpha"] = alpha
    data["params"]["L"] = L
    data["params"]["A"] = A
    data["params"]["delta"] = delta
    data["params"]["deltaT"] = deltaT

    deltaM = delta / 100
    data["params"]["deltaM"] = deltaM
    Eexp = E * 1000
    data["params"]["Eexp"] = Eexp
    alphaExp = alpha / 1000000
    data["params"]["alphaExp"] = alphaExp

    data["correct_answers"]["sigma"] = sigma

    return data
