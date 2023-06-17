import math
import random


def generate(data):
    h = random.randint(70, 90)
    t2 = random.randint(5, 10)
    t1 = random.randint(5, 10)
    b = random.randint(70, 100)
    M = random.randint(600, 800)
    V = random.randint(10, 40)  # in N
    option = random.choice(["compressive", "tensile"])

    ybar = ((b * t2) * (h + t2 / 2) + 2 * t1 * h * h / 2) / (b * t2 + 2 * h * t1)

    IzInp = (
        b * math.pow(t2, 3) / 12
        + (b * t2) * math.pow(h + t2 / 2 - ybar, 2)
        + 2 * (t1 * math.pow(h, 3) / 12 + (t1 * h) * math.pow(h / 2 - ybar, 2))
    )

    Iz = IzInp / math.pow(10, 6)

    if option == "compressive":
        sigma = M * (h + t2 - ybar) / Iz
    if option == "tensile":
        sigma = M * ybar / Iz

    sigma = sigma / 1000

    tau = ybar * ybar * V / (2 * Iz)
    tau = tau / 1000

    data["params"]["b"] = b
    data["params"]["h"] = h
    data["params"]["t1"] = t1
    data["params"]["t2"] = t2
    data["params"]["M"] = M
    data["params"]["option"] = option
    data["params"]["ybar"] = ybar
    data["params"]["IzInp"] = IzInp
    data["params"]["Iz"] = Iz
    data["params"]["V"] = V

    data["correct_answers"]["tau"] = tau
    data["correct_answers"]["sigma"] = sigma

    return data
