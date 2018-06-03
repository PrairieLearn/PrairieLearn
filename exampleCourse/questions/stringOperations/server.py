import random

def generate(data):

    a = random.randint(2,4)
    stringname = "love"

    b = 'hello '
    c = 'it is a beautiful day!'


    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c
    data["params"]["stringname"] = stringname

    data["correct_answers"]["ans1"] = a*stringname
    data["correct_answers"]["ans2"] = b+c
