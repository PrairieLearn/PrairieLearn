import math
import random


def generate(data):
    d = random.randint(20, 50)
    tall = random.randint(20, 30)
    G = random.randint(50, 70)
    b = random.randint(1500, 1800)
    a = random.randint(1200, 1400)

    J = math.pi * math.pow(d, 4) / 32

    Pmax = 2 * J * tall / (d * a)  # N

    Tmax = Pmax * a  # N.mm

    phi = Tmax * b / (1000 * G * J)  # rad

    data["params"]["d"] = d
    data["params"]["tall"] = tall
    data["params"]["G"] = G
    data["params"]["a"] = a
    data["params"]["b"] = b

    data["correct_answers"]["Pmax"] = Pmax
    data["correct_answers"]["phi"] = phi

    return data
