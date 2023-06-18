import math
import random


def generate(data):

    a = random.choice([0.4, 0.5, 0.6, 0.7])
    b = random.choice([0.2, 0.3])
    c = random.choice([0.3, 0.4, 0.45])
    choose = random.choice([1, 2])

    m = random.randint(20, 35)
    alpha = random.choice([30, 40, 45])
    beta = random.choice([15, 20, 10])

    rc = (a / (a + b)) * m * 9.81 * math.cos(math.radians(alpha))
    t = (rc * math.sin(math.radians(alpha))) / math.cos(math.radians(beta))
    ra = (
        (m * 9.81)
        - (t * math.sin(math.radians(beta)))
        - (rc * math.cos(math.radians(alpha)))
    )

    if choose == 1:
        disp = "C"
        rx = -rc * math.sin(math.radians(alpha))
        ry = rc * math.cos(math.radians(alpha))
    else:
        disp = "A"
        ry = ra
        rx = 0

    data["params"]["alpha"] = alpha
    data["params"]["beta"] = beta
    data["params"]["m"] = m
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c
    data["params"]["disp"] = disp

    data["correct_answers"]["rx"] = rx
    data["correct_answers"]["ry"] = ry

    return data
