import math
import random


def generate(data):
    L = random.randint(3, 10)

    imgFile = "Picture1.png"

    ao_2 = -math.pow(L, 4) / 384
    a1_2 = math.pow(L, 3) / 48
    a2_2 = -math.pow(L, 2) / 4
    a3_2 = L / 6
    a4_2 = -round(1 / 24, 5)

    data["params"]["imgFile"] = imgFile
    data["params"]["L"] = L
    data["params"]["a4_2"] = a4_2

    data["correct_answers"]["ao_2"] = ao_2
    data["correct_answers"]["a1_2"] = a1_2
    data["correct_answers"]["a2_2"] = a2_2
    data["correct_answers"]["a3_2"] = a3_2

    return data
