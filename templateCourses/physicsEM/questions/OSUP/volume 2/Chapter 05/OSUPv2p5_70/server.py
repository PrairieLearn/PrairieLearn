import random


def generate(data):

    # Sample a random number
    s = random.choice([1, 2, 3])
    if s == 1:
        q = "An electron"
        Q = 1.6e-19  # C
        m = 9.11e-31  # kg
    elif s == 2:
        q = "A proton"
        Q = 1.6e-19  # C
        m = 1.67e-27  # kg
    else:
        q = "A helium nucleus (two protons and two neutrons)"
        Q = 2 * 1.6e-19  # C
        m = 4 * 1.67e-27  # kg

    # Put this string into data['params']
    data["params"]["q"] = q

    # Compute the solution
    g = 9.81  # m/s^2
    E = m * g / Q

    # Put the solution into data['correct_answers']
    data["correct_answers"]["E"] = round_sig(E, 3)


def round_sig(x, sig):
    from math import floor, log10

    if x == 0:
        y = 0
    else:
        y = sig - int(floor(log10(abs(x)))) - 1
    return round(x, y)
