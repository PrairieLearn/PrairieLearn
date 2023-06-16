import random

import numpy as np


def generate(data):
    a = np.random.randint(1, 4)
    b = np.random.randint(2, 5)
    c = np.random.randint(1, 4)
    d = np.random.randint(1, 4)
    e = np.random.randint(1, 4)
    f = np.random.randint(1, 4)
    g = np.random.randint(1, 4)

    A = np.array([[a, 0, e], [b, d, 0], [c, f, g]])

    Nclassic = random.randint(4, 8)
    Nblue = random.randint(1, 6)
    Nstrawnana = random.randint(6, 10)

    x = np.array([Nclassic, Nblue, Nstrawnana])

    rhs = np.dot(A, x)

    if random.choice([b, e]) == b:
        outputlabel = "a_{21}"
        out = b
        label2 = "Blue"
        out2 = Nblue
    else:
        outputlabel = "a_{13}"
        out = e
        label2 = "Strawnana"
        out2 = Nstrawnana

    data["params"]["a"] = int(a)
    data["params"]["b"] = int(b)
    data["params"]["c"] = int(c)
    data["params"]["d"] = int(d)
    data["params"]["e"] = int(e)
    data["params"]["f"] = int(f)
    data["params"]["g"] = int(g)

    data["params"]["bananas"] = int(rhs[0])
    data["params"]["blueberries"] = int(rhs[1])
    data["params"]["strawberries"] = int(rhs[2])

    data["params"]["outputlabel"] = outputlabel
    data["params"]["label2"] = label2
    data["params"]["Nclassic"] = Nclassic

    data["correct_answers"]["out"] = out
    data["correct_answers"]["out2"] = out2

    return data
