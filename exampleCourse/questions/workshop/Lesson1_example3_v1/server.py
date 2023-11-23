import random


def generate(data):
    Vt = random.randint(100, 200)
    data["params"]["Vt"] = Vt

    R1 = random.choice(list(range(20, 180, 10)))
    data["params"]["R1"] = R1

    R2 = random.choice(list(range(20, 180, 20)))
    data["params"]["R2"] = R2

    R3 = random.choice(list(range(20, 100, 5)))
    data["params"]["R3"] = R3

    Rtinv = 1 / R1 + 1 / R2 + 1 / R3
    Rt = 1 / Rtinv

    data["correct_answers"]["Rt"] = Rt
