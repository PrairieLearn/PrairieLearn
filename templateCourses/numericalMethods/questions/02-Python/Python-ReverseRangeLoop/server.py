import random


def generate(data):

    BB = random.choice([0, 1])
    AA = random.randint(6, 8)
    CC = -2
    integers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    result = ""
    for i in range(AA, BB, CC):
        result += str(integers[i]) + "<br>"

    data["params"]["AA"] = AA
    data["params"]["BB"] = BB
    data["params"]["CC"] = CC
    data["params"]["result"] = result
    return data
