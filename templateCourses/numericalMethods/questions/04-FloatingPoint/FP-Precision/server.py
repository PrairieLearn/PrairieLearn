import random


def generate(data):
    a = random.randint(130, 200)
    data["params"]["a"] = a
    b = random.choice([5, 25, 125])
    data["params"]["b"] = b
    if b == 5:
        data["correct_answers"]["f"] = 8
    elif b == 25:
        data["correct_answers"]["f"] = 9
    elif b == 125:
        data["correct_answers"]["f"] = 10
    return data


def grade(data):
    a = str(data["params"]["a"])
    b = str(data["params"]["b"])
    if data["score"] != 1.0:
        feedback = f"You may consider converting {a}.{b} into the floating point system and find the least bit 1."
    else:
        feedback = ""
    data["feedback"]["question_feedback"] = feedback
