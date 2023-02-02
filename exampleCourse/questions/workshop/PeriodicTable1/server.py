import random


def generate(data):
    namelist = ["Silicon", "Titanium", "Copper"]
    rholist = [2.33, 4.507, 8.92]
    Mlist = [28.086, 47.88, 63.546]

    which = random.choice([0, 1, 2])

    rho = rholist[which]
    M = Mlist[which]
    name = namelist[which]

    Na = 6.02 * 10**23
    N = Na * rho / M

    data["params"]["rho"] = rho
    data["params"]["M"] = M
    data["params"]["name"] = name

    # Put the sum into data['correct_answers']
    data["correct_answers"]["N"] = N
