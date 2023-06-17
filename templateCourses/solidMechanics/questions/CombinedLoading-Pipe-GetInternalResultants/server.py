import math
import random


def generate(data):
    a = random.randint(300, 400)
    b = random.randint(200, 250)
    c = random.randint(250, 280)
    Py = random.randint(300, 500)
    Pz = random.randint(300, 500)

    imgFile = "Picture2.png"

    Fx = 0
    Vy = math.fabs(Py)
    Vz = math.fabs(-Pz)
    Mz = -Py * a / 1000
    My = -Pz * a / 1000
    Tx = (-Py * b - Pz * c) / 1000

    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c
    data["params"]["Py"] = Py
    data["params"]["Pz"] = Pz
    data["params"]["imgFile"] = imgFile

    data["correct_answers"]["Fx"] = Fx
    data["correct_answers"]["Vy"] = Vy
    data["correct_answers"]["Vz"] = Vz
    data["correct_answers"]["Tx"] = Tx
    data["correct_answers"]["My"] = My
    data["correct_answers"]["Mz"] = Mz

    return data
