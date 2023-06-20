import random


def generate(data):

    str1 = " + + + + + + + + + + + + + + "
    str2 = " _  _  _  _  _  _  _  _  _  _  _  _   "

    data["params"]["plus"] = str1
    data["params"]["minus"] = str2

    e = 1.6
    data["params"]["e"] = e
    e = e * 1e-19  # in C

    E = random.randint(50, 100)  # in kN/C
    data["params"]["E"] = E
    E = E * 1e3  # in N/C

    v0 = random.randint(10, 30)  # in Gm/s
    data["params"]["v0"] = v0
    v0 = v0 * 1e6  # in m/s

    m = 9.1
    data["params"]["m"] = m
    m = m * 1e-31  # in kg

    L1 = random.randint(3, 6)  # in cm
    data["params"]["L1"] = L1
    L1 = L1 * 1e-2  # in m

    L2 = random.randint(3, 6)  # in cm
    data["params"]["L2"] = L2
    L2 = L2 * 1e-2  # in m

    # Force
    F = e * E  # in the j direction

    # acceleration
    a = F / m  # in the j direction

    # time
    t = L1 / v0

    # velocity at end region 1
    v1x = v0
    v1y = a * t
    data["correct_answers"]["v1x"] = v1x
    data["correct_answers"]["v1y"] = v1y

    # displacement at end region 1
    y1 = 0.5 * a * t**2
    data["correct_answers"]["y1"] = y1

    # not needed for the problem, but providing a value that is larger that y1
    h = round(2 * y1 * 100)  # in cm
    data["params"]["h"] = h

    # displacement at the screen
    tantheta = v1y / v1x
    y2 = L2 * tantheta
    ytotal = y1 + y2
    data["correct_answers"]["ytotal"] = ytotal
