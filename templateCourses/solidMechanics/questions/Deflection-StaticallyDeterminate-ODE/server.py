import math
import random


def generate(data):
    L = random.randint(5, 8)
    E = random.randint(150, 250)
    M = random.randint(8, 14)
    Iz = random.randint(40, 60)
    P = random.randint(6, 12)

    IzVar = Iz * math.pow(10, -6)

    imgFile = "Picture1.png"

    alpha = 1 / (E * Iz)

    ao_1 = 0
    a1_1 = 0
    a2_1 = alpha * (-M / 2.0 + (L * P) / 2.0)
    a3_1 = alpha * (-P / 6.0)
    a4_1 = 0

    ao_2 = alpha * ((math.pow(L, 2) * M) / 2.0 - (math.pow(L, 3) * P) / 6.0)
    a1_2 = alpha * (-(L * M) + (math.pow(L, 2) * P) / 2.0)
    a2_2 = 0
    a3_2 = 0
    a4_2 = 0

    data["params"]["imgFile"] = imgFile
    data["params"]["L"] = L
    data["params"]["E"] = E
    data["params"]["M"] = M
    data["params"]["P"] = P
    data["params"]["Iz"] = Iz
    data["params"]["IzVar"] = IzVar

    data["correct_answers"]["ao_1"] = ao_1
    data["correct_answers"]["a1_1"] = a1_1
    data["correct_answers"]["a2_1"] = a2_1
    data["correct_answers"]["a3_1"] = a3_1
    data["correct_answers"]["a4_1"] = a4_1
    data["correct_answers"]["ao_2"] = ao_2
    data["correct_answers"]["a1_2"] = a1_2
    data["correct_answers"]["a2_2"] = a2_2
    data["correct_answers"]["a3_2"] = a3_2
    data["correct_answers"]["a4_2"] = a4_2

    return data
