import random

def generate(data):

    a = random.randint(5, 10)
    b = random.randint(5, 10)
    data["params"]["a"] = a
    data["params"]["b"] = b

    c = a + b
    data["correct_answers"]["c"] = c

    return data
