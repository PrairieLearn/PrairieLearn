import math
import random


def generate(data):

    w = random.randint(4, 10)
    a = random.randint(1, 10)

    imgFile = random.choice(["Picture1.png", "Picture2.png"])

    if imgFile == "Picture1.png":
        P = random.uniform(w * a / 4, w * a / 2)
        P = round(P)

        Ra = P / 2 + (5 * w * a) / 4
        Rb = P / 2 - (w * a) / 4
        ao_1 = 0
        a1_1 = -w
        a2_1 = 0
        ao_2 = P / 2 + (a * w) / 4
        a1_2 = 0
        a2_2 = 0
        ao_3 = -(P / 2) + (a * w) / 4
        a1_3 = 0
        a2_3 = 0
        mao_1 = 0
        ma1_1 = 0
        ma2_1 = -w / 2
        mao_2 = -((a * P) / 2) - (3 * a * a * w) / 4
        ma1_2 = 1 / 4 * (2 * P + a * w)
        ma2_2 = 0
        mao_3 = -3 / 4 * (-2 * a * P + a * a * w)
        ma1_3 = 1 / 4 * (-2 * P + a * w)
        ma2_3 = 0

    if imgFile == "Picture2.png":
        P = random.uniform(w * a / 2, w * a)
        P = round(P)

        Ra = (3 * P) / 2 + (3 * w * a) / 4
        Rb = -(P / 2) + (w * a) / 4

        ao_1 = -P
        a1_1 = 0
        a2_1 = 0

        ao_2 = P / 2 + (7 * a * w) / 4
        a1_2 = -w
        a2_2 = 0

        ao_3 = P / 2 - (a * w) / 4
        a1_3 = 0
        a2_3 = 0

        mao_1 = 0
        ma1_1 = -P
        ma2_1 = 0

        mao_2 = -((3 * a * P) / 2) - (5 * a * a * w) / 4
        ma1_2 = P / 2 + (7 * a * w) / 4
        ma2_2 = -w / 2

        mao_3 = 3 / 4 * (-2 * a * P + a * a * w)
        ma1_3 = P / 2 - (a * w) / 4
        ma2_3 = 0

    data["params"]["w"] = w
    data["params"]["a"] = a
    data["params"]["imgFile"] = imgFile
    data["params"]["P"] = P

    data["correct_answers"]["ao_1"] = ao_1
    data["correct_answers"]["a1_1"] = a1_1
    data["correct_answers"]["a2_1"] = a2_1
    data["correct_answers"]["ao_2"] = ao_2
    data["correct_answers"]["a1_2"] = a1_2
    data["correct_answers"]["a2_2"] = a2_2
    data["correct_answers"]["ao_3"] = ao_3
    data["correct_answers"]["a1_3"] = a1_3
    data["correct_answers"]["a2_3"] = a2_3

    data["correct_answers"]["mao_1"] = mao_1
    data["correct_answers"]["ma1_1"] = ma1_1
    data["correct_answers"]["ma2_1"] = ma2_1
    data["correct_answers"]["mao_2"] = mao_2
    data["correct_answers"]["ma1_2"] = ma1_2
    data["correct_answers"]["ma2_2"] = ma2_2
    data["correct_answers"]["mao_3"] = mao_3
    data["correct_answers"]["ma1_3"] = ma1_3
    data["correct_answers"]["ma2_3"] = ma2_3

    return data
