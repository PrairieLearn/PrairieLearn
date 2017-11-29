import random

def generate(data):

    a = random.randint(5, 10)
    b = random.randint(5, 10)
    data["params"]["a"] = a
    data["params"]["b"] = b


    x = 168
    y = 178
    data["correct_answers"]["x"] = x
    data["correct_answers"]["y"] = y
    data["correct_answers"]["width"] = 10
    data["correct_answers"]["height"] = 20

    return data
