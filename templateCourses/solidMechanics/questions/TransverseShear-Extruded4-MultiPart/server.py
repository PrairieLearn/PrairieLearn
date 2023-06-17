import math
import random


def generate(data):
    t = random.randint(5, 10)
    b = random.randint(20, 30)
    V = random.randint(10, 40)
    V1 = V * 1000  # V1 in kN

    Iz = (
        8
        * (
            4 * math.pow(b, 4)
            + 24 * math.pow(b, 3) * t
            + 42 * math.pow(b, 2) * math.pow(t, 2)
            + 27 * b * math.pow(t, 3)
            + 4 * math.pow(t, 4)
        )
    ) / 3.0

    Qc = b * t * (2 * b + (5 * t) / 2.0)
    Qb = 2 * b * (2 * b + t) * (2 * t + (2 * b + t) / 2.0) + 2 * Qc
    Qa = 2 * math.pow(t, 2) * (4 * b + 2 * t) + Qb

    alpha = V1 / Iz

    taua = alpha * Qa / (4 * b + 2 * t)
    taub = alpha * Qb / (2 * b)
    tauc = alpha * Qc / t

    tau = taua
    location = "y = 0"
    type = "$ \\tau_{xy}$"
    Q = Qa

    if taub > tau:
        tau = taub
        type = "$ \\tau_{xy}$"
        location = "y = 2t"
        Q = Qb
    if tauc > tau:
        tau = tauc
        type = "$ \\tau_{xz}$"
        location = " 2b+2t <y < 2b + 3t \rm\ z = t+b"
        Q = Qc

    data["params"]["b"] = b
    data["params"]["t"] = t
    data["params"]["V"] = V
    data["params"]["Iz"] = Iz
    data["params"]["location"] = location
    data["params"]["type"] = type
    data["params"]["Q"] = Q

    data["correct_answers"]["tau"] = tau

    return data
