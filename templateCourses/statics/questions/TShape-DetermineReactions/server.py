import math
import random


def generate(data):

    # define input variables
    a = random.randint(8, 12)
    b = random.randint(15, 19)
    d = random.randint(a + 1, b - 1)
    P = random.randint(300, 400)

    # store input variables
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["d"] = d
    data["params"]["P"] = P

    # calculate hypotenuse, W and reaction at B, Rb
    c = math.sqrt(a**2 + b**2)
    W = P * c / a
    Ra = W * d / c
    Rb = W * (b + d) / c

    # output correct answers
    data["correct_answers"]["W"] = W
    data["correct_answers"]["Ra"] = Ra
    data["correct_answers"]["Rb"] = Rb
    return data
