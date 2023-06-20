import math
import random


def generate(data):

    str1 = " + + + + + + + + + + + + + + "
    str2 = " _  _  _  _  _  _  _  _  _  _  _  _   "

    data["params"]["plus"] = str1
    data["params"]["minus"] = str2

    E = random.randint(100, 300)  # in kV/m
    data["params"]["E"] = E
    E = E * 1e3  # in V/m

    h = random.randint(10, 50)  # in cm
    data["params"]["h"] = h
    h = h * 1e-2  # in m

    q = random.randint(1, 4)  # in micro C
    data["params"]["q"] = q
    q = q * 1e-6  # in C

    m = random.randint(1, 4)  # in mg
    data["params"]["m"] = m
    m = m * 1e-6  # in kg

    v = math.sqrt(q * E * 2 * h / m)
    ke = 0.5 * m * v**2

    data["correct_answers"]["v"] = v
    data["correct_answers"]["ke"] = ke
