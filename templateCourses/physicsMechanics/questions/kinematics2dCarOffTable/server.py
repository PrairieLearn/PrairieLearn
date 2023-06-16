import random

import numpy as np


def generate(data):
    # gravity (m/s^2)
    g = 9.8
    # angle with horizontal (in degrees)
    theta = 0
    # initial velocity  (m/s)
    v0 = random.randint(2, 10)
    # height of the table (m)
    h = np.round(random.randint(100, 200) / 100, 2)

    # storing the parameters
    data["params"]["v0"] = v0
    data["params"]["theta"] = theta
    data["params"]["h"] = h

    # time in the air (s)
    t = np.sqrt(2 * h / g)

    # velocity in y-direction at impact (m/s)
    vy = -g * t

    # speed at impact (m/s)
    vmag = np.sqrt(vy**2 + v0**2)

    # distance at impact (m)
    d = v0 * t

    data["correct_answers"]["tb"] = t
    data["correct_answers"]["vbx"] = v0
    data["correct_answers"]["vby"] = vy
    data["correct_answers"]["vmag"] = vmag
    data["correct_answers"]["d"] = d
