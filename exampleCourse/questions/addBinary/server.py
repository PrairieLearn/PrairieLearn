import random

def generate(data):

    a = "01011"
    b = "10010"
    data["params"]["a"] = a
    data["params"]["b"] = b

    c = "11101"
    data["correct_answers"]["c"] = c

def grade(data):
    # use get() for submitted_answers in case no answer was submitted
    if data["submitted_answers"].get("c", None) == data["correct_answers"]["c"]:
        data["score"] = 1
    else:
        data["score"] = 0
