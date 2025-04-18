import random


def generate(data):
    a = random.randint(100, 200)
    ans = f"{a:b}"
    data["params"]["a"] = a
    data["correct_answers"]["b"] = ans
