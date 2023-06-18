import math
import random


def generate(data):
    t = random.randint(10, 20)
    a = random.randint(20, 30)
    ab = random.randint(20, 30) / 10
    bc = ab
    cd = ab * 0.5
    F = random.randint(1, 4)

    alpha = a * (math.pi / 180)
    theta = t * (math.pi / 180)

    rx = bc * math.cos(theta)
    ry = -((ab * math.sin(alpha)) + (bc * math.sin(theta)))
    rz = (ab * math.cos(alpha)) + cd
    M = 0 - (-math.sin(alpha) * (rx * 0 - rz * F)) + math.cos(alpha) * (rx * 0 - ry * F)
    Mx = 0
    My = -math.sin(alpha) * M
    Mz = math.cos(alpha) * M

    data["params"]["a"] = a
    data["params"]["t"] = t
    data["params"]["ab"] = ab
    data["params"]["bc"] = bc
    data["params"]["cd"] = cd
    data["params"]["F"] = F

    data["correct_answers"]["Mx"] = Mx
    data["correct_answers"]["My"] = My
    data["correct_answers"]["Mz"] = Mz

    return data
