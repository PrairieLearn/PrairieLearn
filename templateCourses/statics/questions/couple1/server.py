import math
import random


def generate(data):

    # Sample two random integers between 5 and 10 (inclusive)
    choice = random.choice([1, 2])

    if choice == 1:
        optionPoint = "O"
    elif choice == 2:
        optionPoint = "P"

    data["params"]["optionPoint"] = optionPoint

    alpha = random.randint(20, 40)
    f = random.randint(50, 70)
    a = random.randint(100, 150)
    b = random.randint(200, 250)
    l = random.randint(80, 100)

    alphaRad = alpha * math.pi / 180

    # This is answer, no matter where the point is
    Mx = 0
    My = 0
    Mz = -(3 * f * (2 * l + b * math.cos(alphaRad))) / 100

    # Put these two integers into data['params']
    data["params"]["alpha"] = alpha
    data["params"]["f"] = f
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["l"] = l

    # Put the sum into data['correct_answers']
    data["correct_answers"]["Mx"] = Mx
    data["correct_answers"]["My"] = My
    data["correct_answers"]["Mz"] = Mz
