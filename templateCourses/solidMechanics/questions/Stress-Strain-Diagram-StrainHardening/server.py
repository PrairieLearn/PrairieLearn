import math
import random


def generate(data):

    epsilon = random.randint(1, 10)
    epsilonreal = epsilon / 1000

    epsilonp = 0
    E = 10300
    sigmay = 47.8

    emax = (sigmay + E * 0.002) / E
    if epsilonreal > emax:
        epsilonp = epsilonreal - sigmay / E

    data["params"]["epsilon"] = epsilon

    data["correct_answers"]["epsilonp"] = epsilonp

    return data
