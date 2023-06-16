import math
import random


def generate(data):
    ans = 1

    a = random.randint(1, 10) / 10
    b = random.choice([4, 8])
    c = random.randint(1, 10) / 10
    if (a**2 + math.sin(math.pi / float(b)) <= c) and (
        a - c + math.exp(math.pi / float(b)) <= 1
    ):
        ans += 1
    d = random.randint(1, 10) / 10
    e = random.randint(1, 10) / 10
    f = random.randint(1, 10) / 10
    # print(d**2+math.sin(e)-f)
    # print(d-f+math.exp(e) -1)
    if (d**2 + math.sin(e) <= f) and (d - f + math.exp(e) <= 1):
        ans += 1
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c
    data["params"]["d"] = d
    data["params"]["e"] = e
    data["params"]["f"] = f
    data["correct_answers"]["g"] = ans
    return data
