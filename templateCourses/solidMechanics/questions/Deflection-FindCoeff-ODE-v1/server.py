import math
import random


def generate(data):
    L = random.randint(3, 10)

    imgFile = "Picture1.png"

    ao_2 = math.pow(L, 3) / 48
    a1_2 = -3 * math.pow(L, 2) / 16
    a2_2 = L / 4
    a3_2 = -round(1 / 12, 5)

    data["params"]["imgFile"] = imgFile
    data["params"]["L"] = L
    data["params"]["a3_2"] = a3_2

    data["correct_answers"]["ao_2"] = ao_2
    data["correct_answers"]["a1_2"] = a1_2
    data["correct_answers"]["a2_2"] = a2_2

    return data
