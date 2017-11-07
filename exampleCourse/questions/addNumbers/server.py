import random

def generate(data):

    a = random.randint(5, 10)
    b = random.randint(5, 10)
    data["params"]["a"] = a
    data["params"]["b"] = b


    x = 10
    y = 20
    data["correct_answers"]["x"] = x
    data["correct_answers"]["y"] = y

    return data
