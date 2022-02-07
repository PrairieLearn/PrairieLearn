import random, math

def generate(data):

    a = random.randint(100, 200)
    ans = "{0:b}".format(a)
    data["params"]["a"] = a
    data["correct_answers"]["b"] = ans

    return data
