import math
import random


def generate(data):

    # Define 3 loading cases: forces at (F and C), (F and E), or (C and E).
    Fx1set = [400, 400, 200]
    Fy1set = [50, 50, 200]
    Fangle1set = [0, 0, 90]
    Fx2set = [200, 300, 300]
    Fy2set = [200, 200, 200]
    Fangle2set = [90, 90, 90]

    # Select a case and define drawing variables
    which1 = random.choice([0, 1, 2])
    Fx1 = Fx1set[which1]
    Fy1 = Fy1set[which1]
    Fangle1 = Fangle1set[which1]
    Fx2 = Fx2set[which1]
    Fy2 = Fy2set[which1]
    Fangle2 = Fangle2set[which1]

    P = 2 + 0.1 * random.randint(1, 8)
    a = random.randint(6, 8)
    b = random.randint(9, 12)

    if which1 == 0:
        zfm = 1
        location = "$C$ and $F$"
        Ax = -P
        Ay = (2 * a - b) / (3 * a) * P
        G = P - Ay
    elif which1 == 1:
        zfm = 2
        location = "$E$ and $F$"
        Ax = -P
        Ay = (a - b) / (3 * a) * P
        G = P - Ay
    else:
        zfm = 2
        location = "$C$ and $E$"
        Ax = 0
        Ay = P
        G = P

    # Put these drawing variables into data['params']
    data["params"]["Fx1"] = Fx1
    data["params"]["Fy1"] = Fy1
    data["params"]["Fangle1"] = Fangle1
    data["params"]["Fx2"] = Fx2
    data["params"]["Fy2"] = Fy2
    data["params"]["Fangle2"] = Fangle2
    data["params"]["location"] = location

    which2 = random.choice([0, 1])
    if which2 == 0:
        name = "AB"
        F = -Ay / (b / math.sqrt(a**2 + b**2))
    else:
        name = "BE"
        if which1 == 0 or which1 == 2:
            F = (Ay - P) / (b / math.sqrt(a**2 + b**2))
        else:
            F = Ay / (b / math.sqrt(a**2 + b**2))

    data["params"]["name"] = name
    data["params"]["P"] = P
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["correct_answers"]["zfm"] = zfm
    data["correct_answers"]["F"] = F

    return data
