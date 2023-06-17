import math
import random


def generate(data):

    b = random.randint(2, 8)
    t = random.randint(1, 4)
    L = random.randint(10, 20)
    G = random.randint(3, 8)
    P = random.randint(600, 800)

    G = G * 1000

    tau = P / (b * L)

    u = P * t / (b * L * G)

    data["params"]["b"] = b
    data["params"]["t"] = t
    data["params"]["L"] = L
    data["params"]["G"] = G
    data["params"]["P"] = P

    data["correct_answers"]["tau"] = tau
    data["correct_answers"]["u"] = u

    return data
