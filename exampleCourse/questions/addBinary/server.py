import random

def generate(data):

    a = "01011"
    b = "10010"
    data["params"]["a"] = a
    data["params"]["b"] = b

    c = "11101"
    data["correct_answers"]["c"] = c

    return data

def grade(data):
    if data["submitted_answers"]["c"] == data["correct_answers"]["c"]:
        data["score"] = 1
    else:
        data["score"] = 0
    return data
