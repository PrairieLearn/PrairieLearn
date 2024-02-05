import math
import random


def generate(data):

    Lo = 200
    d = random.randint(25, 30)
    delta = random.randint(1, 3)
    delta = round(delta * 0.1, 1)
    P = random.randint(120, 150)
    sigmay = 350
    Pn = P * 1000

    A = math.pi * math.pow(d, 2) / 4
    E = 0

    if Pn / A > sigmay:
        E = 1
    else:
        E = (P * Lo) / (A * delta)

    G = math.floor(random.uniform(E / 2.8, E / 2.2))

    nu = E / (2 * G) - 1

    deltad = d * nu * delta / Lo

    data["params"]["Lo"] = Lo
    data["params"]["d"] = d
    data["params"]["delta"] = delta
    data["params"]["P"] = P
    data["params"]["G"] = G
    data["params"]["sigmay"] = sigmay

    data["correct_answers"]["E"] = E
    data["correct_answers"]["nu"] = nu
    data["correct_answers"]["deltad"] = deltad

    return data
