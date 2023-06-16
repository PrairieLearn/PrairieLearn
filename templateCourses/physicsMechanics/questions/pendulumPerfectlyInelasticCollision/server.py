import math
import random


def generate(data):

    g = 9.8
    # angle
    theta = 30  # random.choice([30,35,40,45])
    theta = theta * math.pi / 180
    # masses
    m = random.randint(3, 9)  # in grams
    data["params"]["m"] = m
    m = m * 1e-3  # in kg for calculations
    M = random.randint(1, 3)  # in kg
    data["params"]["M"] = M
    # Length
    h = round(random.randint(30, 50) / 1000, 3)  # in meters
    data["params"]["h"] = h

    # velocity of the projectile + box right after the impact
    vb = math.sqrt(2 * g * h)
    data["correct_answers"]["vb"] = vb

    # velocity of the projectile right before impact
    v = (m + M) * vb / m
    data["correct_answers"]["v"] = v

    # energy lost
    E = 0.5 * (m * v**2 - (m + M) * vb**2)
    data["correct_answers"]["E"] = E

    return data
