import math
import random


def generate(data):

    tb = random.randint(1, 4)
    Gs = random.randint(10, 12)
    Ga = random.randint(3, 5)
    ds = random.randint(3, 5)
    da = ds + 1
    L = random.randint(40, 50)
    option = random.choice(["steel core", "aluminum sleeve"])

    Ja = math.pi * (math.pow(da, 4) - math.pow(ds, 4)) / 32
    Js = math.pi * math.pow(ds, 4) / 32

    taus = 0.5 * Gs * tb * ds / (Ga * Ja + Gs * Js)
    taua = 0.5 * Ga * tb * da / (Ga * Ja + Gs * Js)
    taumax = 0

    GaLong = Ga * 1000
    GsLong = Gs * 1000

    if option == "steel core":
        taumax = taus
    if option == "aluminum sleeve":
        taumax = taua

    data["params"]["tb"] = tb
    data["params"]["Ga"] = Ga
    data["params"]["Gs"] = Gs
    data["params"]["GaLong"] = GaLong
    data["params"]["GsLong"] = GsLong
    data["params"]["da"] = da
    data["params"]["ds"] = ds
    data["params"]["L"] = L
    data["params"]["option"] = option

    data["correct_answers"]["taumax"] = taumax

    return data
