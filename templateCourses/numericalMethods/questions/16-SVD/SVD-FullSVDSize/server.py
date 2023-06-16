import random


def generate(data):

    # Matrix shape
    M = random.randint(2, 8)
    while True:
        N = random.randint(2, 8)
        if N != M:
            break
    r = min(M, N)

    data["params"]["m"] = M
    data["params"]["n"] = N

    data["correct_answers"]["u1"] = M
    data["correct_answers"]["u2"] = M
    data["correct_answers"]["s1"] = M
    data["correct_answers"]["s2"] = N
    data["correct_answers"]["v1"] = N
    data["correct_answers"]["v2"] = N

    return data
