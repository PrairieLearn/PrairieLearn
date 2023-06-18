import random


def generate(data):

    # Randomize car geometry
    p = random.randint(20, 30)
    i = random.randint(2, 6) / 10
    a = 4 * i
    b = 3 * i

    fab = -5 * p / 6
    fac = 4 * p / 6
    fbc = 0
    fce = 4 * p / 6
    fbe = -5 * p / 6
    fde = 0
    fbd = 0

    qs = random.randint(1, 7)
    if qs == 1:
        ans = fab
        name = "F_{AB}"
        member = "AB"
    elif qs == 2:
        ans = fac
        name = "F_{AC}"
        member = "AC"
    elif qs == 3:
        ans = fbc
        name = "F_{BC}"
        member = "BC"
    elif qs == 4:
        ans = fce
        name = "F_{CE}"
        member = "CE"
    elif qs == 5:
        ans = fbe
        name = "F_{BE}"
        member = "BE"
    elif qs == 6:
        ans = fde
        name = "F_{DE}"
        member = "DE"
    else:
        ans = fbd
        name = "F_{BD}"
        member = "BD"

    data["params"]["p"] = p
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["name"] = name
    data["params"]["member"] = member

    data["correct_answers"]["ans"] = ans

    return data
