import random


def generate(data):
    Ax = 0
    Ay = 0
    Az = 0
    Bx = 0
    By = (random.randint(10, 50) / 100) + 10
    Bz = 0
    Cx = (random.randint(4, 20) / 20) + 3
    Cy = By
    Cz = 0
    Dx = Cx
    Dy = By
    Dz = (random.randint(1, 20) / 20) + 2
    Ex = Cx
    Ey = By
    Ez = -((random.randint(1, 20) / 20) + 2)
    w1 = random.randint(10, 50) / 10
    w2 = random.randint(10, 50) / 10
    w3 = random.randint(10, 50) / 10

    Rx = 0
    Rz = 0
    Ry = 9.81 * (w1 + w2 + w3)

    mx = 9.81 * w3 * (-Ez) - 9.81 * w1 * Dz
    my = 0
    mz = Cx * (w1 + w2 + w3) * 9.81

    data["params"]["Ax"] = Ax
    data["params"]["Ay"] = Ay
    data["params"]["Az"] = Az
    data["params"]["Bx"] = Bx
    data["params"]["By"] = By
    data["params"]["Bz"] = Bz
    data["params"]["Cx"] = Cx
    data["params"]["Cy"] = Cy
    data["params"]["Cz"] = Cz
    data["params"]["Dx"] = Dx
    data["params"]["Dy"] = Dy
    data["params"]["Dz"] = Dz
    data["params"]["Ex"] = Ex
    data["params"]["Ey"] = Ey
    data["params"]["Ez"] = Ez

    data["params"]["w1"] = w1
    data["params"]["w2"] = w2
    data["params"]["w3"] = w3

    data["correct_answers"]["Rx"] = Rx
    data["correct_answers"]["Ry"] = Ry
    data["correct_answers"]["Rz"] = Rz
    data["correct_answers"]["mx"] = mx
    data["correct_answers"]["my"] = my
    data["correct_answers"]["mz"] = mz

    return data
