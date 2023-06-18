import random


def generate(data):

    W = random.randint(25, 30)
    L = random.randint(1, 3)
    h = random.randint(4, 6)
    d = random.choice([0.4, 0.5, 0.6, 0.75, 0.9]) * h
    d = round(d, 2)

    mu = random.choice([0.5, 0.6, 0.7, 0.8, 0.9])

    Ptip = W * (L / 2) / d
    Pslip = W * mu

    if Ptip < Pslip:
        Pmin = Ptip
    else:
        Pmin = Pslip

    # Put these variables into data['params']
    data["params"]["W"] = W
    data["params"]["L"] = L
    data["params"]["h"] = h
    data["params"]["d"] = d
    data["params"]["mu"] = mu
    data["correct_answers"]["Pmin"] = Pmin

    return data
