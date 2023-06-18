import random


def generate(data):

    # Randomize car geometry
    F1 = 4000
    F2 = 8000
    F3 = 5000
    a = 9
    b = 12

    fcd = -9375
    fcj = -3125
    fkj = 11250
    fdj = 0

    qs = random.randint(1, 3)
    if qs == 1:
        ans = fcd
        name = "F_{CD}"
        member = "CD"
    elif qs == 2:
        ans = fcj
        name = "F_{CJ}"
        member = "CJ"
    else:
        ans = fkj
        name = "F_{KJ}"
        member = "KJ"

    data["params"]["F1"] = F1
    data["params"]["F2"] = F2
    data["params"]["F3"] = F3
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["name"] = name
    data["params"]["member"] = member

    data["correct_answers"]["ans"] = ans
    data["correct_answers"]["fdj"] = fdj

    return data
