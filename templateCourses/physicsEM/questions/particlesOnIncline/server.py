import math
import random


def generate(data):

    # masses
    m1 = random.randint(1, 4)  # in mg
    m2 = random.randint(1, 4)  # in mg
    data["params"]["m1"] = m1
    data["params"]["m2"] = m2
    m1 = m1 * 1e-6  # in kg
    m2 = m2 * 1e-6  # in kg

    # charges
    c = random.sample(range(2, 6), 2)
    q1 = c[0]  # in micro C
    q2 = c[1]  # in micro C
    data["params"]["q1"] = q1
    data["params"]["q2"] = q2
    q1 = q1 * 1e-6  # in C
    q2 = q2 * 1e-6  # in C

    # angle
    theta = random.randint(25, 40)  # in degrees
    data["params"]["theta"] = theta
    theta = theta * math.pi / 180  # in radians

    # constants
    g = 9.81  # in m/s^2
    k = 9 * 1e9  # in N m^2/C^2

    # distance
    d = math.sqrt(k * q1 * q2 / (m2 * g * math.sin(theta)))

    # given distance, find acceleration
    D = random.randint(1, int(d / 2))
    data["params"]["D"] = D
    a = (k * q1 * q2 / (D**2) - m2 * g * math.sin(theta)) / m2

    data["correct_answers"]["d"] = d
    data["correct_answers"]["a"] = a
