import random

import numpy as np


def generate(data):

    # Mass of the objects
    m1 = np.round(random.randint(10, 30) / 10, 2)
    m2 = np.round(random.randint(10, 30) / 10, 2)
    data["params"]["m1"] = m1
    data["params"]["m2"] = m2

    # Velocity of object 1
    v1 = random.randint(10, 20)
    data["params"]["v1"] = v1

    # Speed of the system after collision
    v = m1 * v1 / (m1 + m2)
    data["correct_answers"]["v"] = v

    # Impulse
    imp = (m2) * v
    data["correct_answers"]["imp"] = imp

    # heat energy
    initial_K = 0.5 * m1 * v1**2  # initial kinetic energy
    final_K = 0.5 * (m1 + m2) * v**2  # final kinetic energy
    E = initial_K - final_K
    data["correct_answers"]["E"] = E
