import random


def generate(data):
    v = random.randint(2, 7)
    F = random.randint(4, 9)
    rho = random.randint(10, 80)

    a = v**2 / rho
    m = F / a

    data["params"]["F"] = F
    data["params"]["v"] = v
    data["params"]["rho"] = rho

    data["correct_answers"]["m"] = m

    return data
