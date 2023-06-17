import math
import random


def generate(data):

    E1 = random.randint(65, 75)
    E2 = random.randint(195, 210)
    L = random.randint(700, 800)
    P = random.randint(80, 100)
    D = random.randint(40, 45)
    d = random.randint(20, 30)
    string = random.choice(["steel tube", "aluminum rod"])

    # Aluminum Rod
    Area1 = math.pi * d * d / 4
    f1 = L / (Area1 * E1)
    # Steel Pipe
    Area2 = math.pi * D * D / 4 - math.pi * d * d / 4
    f2 = L / (Area2 * E2)

    F1 = -P * f2 / (f1 + f2)
    F2 = -P * f1 / (f1 + f2)

    sigma = 0

    if string == "aluminum rod":
        # console.log(string)
        sigma = 1000 * F1 / Area1
    if string == "steel tube":
        # console.log(string)
        sigma = 1000 * F2 / Area2
    # console.log(sigma);

    data["params"]["E1"] = E1
    data["params"]["E2"] = E2
    data["params"]["L"] = L
    data["params"]["D"] = D
    data["params"]["d"] = d
    data["params"]["P"] = P
    data["params"]["string"] = string

    data["correct_answers"]["sigma"] = sigma

    return data
