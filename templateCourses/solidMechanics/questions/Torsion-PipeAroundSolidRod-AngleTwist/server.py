import math
import random


def generate(data):

    tb = random.randint(1, 4)
    Gs = random.randint(10, 12)
    Ga = random.randint(3, 5)
    ds = random.randint(3, 5)
    da = ds + 1
    L = random.randint(40, 50)

    Ja = math.pi * (math.pow(da, 4) - math.pow(ds, 4)) / 32
    Js = math.pi * math.pow(ds, 4) / 32

    phib = 0.001 * tb * L / (Ga * Ja + Gs * Js)

    GaLong = Ga * 1000
    GsLong = Gs * 1000

    data["params"]["tb"] = tb
    data["params"]["Ga"] = Ga
    data["params"]["Gs"] = Gs
    data["params"]["GaLong"] = GaLong
    data["params"]["GsLong"] = GsLong
    data["params"]["da"] = da
    data["params"]["ds"] = ds
    data["params"]["L"] = L

    data["correct_answers"]["phib"] = phib

    return data
