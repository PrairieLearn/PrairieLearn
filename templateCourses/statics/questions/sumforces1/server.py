import math
import random


def generate(data):

    # Randomize car geometry

    m = random.randint(12, 17)
    a = 2 * random.randint(100, 110)
    b = random.randint(100, 110)
    c = random.randint(100, 110)
    d = random.randint(100, 110)
    h = random.randint(70, 80)

    g = 9.81
    t1 = (b * g * math.sqrt(math.pow(a, 2) + math.pow(c, 2) + math.pow(h, 2)) * m) / (
        a * h + b * h
    )
    t2 = (
        (-(b * c) + a * d)
        * g
        * math.sqrt(math.pow(b, 2) + math.pow(c, 2) + math.pow(h, 2))
        * m
    ) / ((a + b) * (c + d) * h)
    t3 = (c * g * math.sqrt(math.pow(b, 2) + math.pow(d, 2) + math.pow(h, 2)) * m) / (
        (c + d) * h
    )

    data["params"]["m"] = m
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c
    data["params"]["d"] = d
    data["params"]["h"] = h
    data["correct_answers"]["t1"] = t1
    data["correct_answers"]["t2"] = t2
    data["correct_answers"]["t3"] = t3

    return data
