import random


def generate(data):

    # Randomize car geometry

    f1 = random.randint(10, 30)
    f2 = random.randint(10, 30)
    f3 = random.randint(40, 60)

    Fx = -f1 * 0.8660254 + f2 * 0.5
    Fy = -f1 * 0.5 + f2 * 0.8660254 - f3
    Fz = 0

    mx = 0
    my = 0
    mz = -f1 * 0.5 + f2 * 0.8660254 * 4 - f3 * 5

    data["params"]["f1"] = f1
    data["params"]["f2"] = f2
    data["params"]["f3"] = f3

    data["correct_answers"]["Fx"] = Fx
    data["correct_answers"]["Fy"] = Fy
    data["correct_answers"]["Fz"] = Fz
    data["correct_answers"]["mx"] = mx
    data["correct_answers"]["my"] = my
    data["correct_answers"]["mz"] = mz

    return data
