import math
import random

import numpy as np


def generate(data):

    # Acceleration going up
    a = np.round(random.randint(10, 30) / 10, 2)
    data["params"]["a"] = a

    # Time going up
    t = random.randint(10, 17)
    data["params"]["t"] = t

    # Going up calculations
    v0 = 0  # starts at rest
    x0 = 0  # ride starting point at the bottom
    # height the ride achieves after time t
    xf = x0 + v0 * t + 0.5 * a * t**2
    data["correct_answers"]["xf"] = xf
    # velocity at time t (before free fall)
    vf = v0 + a * t

    # Free Fall
    g = -9.8
    # solution of the quadratic equation
    # delta = vf**2 - 2*g*(xf/2)
    delta = vf**2 - 2 * g * (xf)
    # This is the positive solution
    tb = (-vf - math.sqrt(delta)) / g
    data["correct_answers"]["tb"] = tb
    # velocity at breaking point
    vb = vf + g * tb
    data["correct_answers"]["vb"] = abs(vb)
