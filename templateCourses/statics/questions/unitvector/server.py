import random


def generate(data):

    a = random.randint(-10, 10)
    b = random.randint(-10, 10)
    c = random.randint(5, 10)

    f_mag = ((a**2) + (b**2) + (c**2)) ** 0.5

    ix = a / f_mag
    iy = b / f_mag
    iz = c / f_mag

    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c

    data["correct_answers"]["ix"] = ix
    data["correct_answers"]["iy"] = iy
    data["correct_answers"]["iz"] = iz

    return data
