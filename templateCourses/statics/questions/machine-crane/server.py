import math
import random


def generate(data):

    # Randomize geometry and loading
    W = random.randrange(1400, 1600, 50)
    a = random.randint(5, 7)
    b = random.randint(8, 12)
    c = random.randint(1, 2)
    alpha = random.randint(65, 85)
    beta = 30

    fab = W * b / (math.sin(math.pi / 3) * c)
    fad = fab * math.sin(math.pi / 3) / math.sin(alpha / 180 * math.pi)
    fac = fab * math.cos(math.pi / 3) - fad * math.cos(alpha / 180 * math.pi)

    qs = random.randint(2, 3)
    if qs == 1:
        ans = fab
        name = "F_{AB}"
        member = "AB"
    elif qs == 2:
        ans = fad
        name = "F_{AD}"
        member = "AD"
    else:
        ans = fac
        name = "F_{AC}"
        member = "AC"

    data["params"]["W"] = W
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c
    data["params"]["alpha"] = alpha
    data["params"]["beta"] = beta
    data["params"]["name"] = name
    data["params"]["member"] = member

    data["correct_answers"]["ans"] = ans

    return data
