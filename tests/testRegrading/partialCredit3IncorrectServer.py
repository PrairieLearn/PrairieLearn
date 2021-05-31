import random

def generate(data):
    data["correct_answers"]["s"] = 100

def grade(data):
    if data["submitted_answers"]["s"] == 50:
        data["score"] = 1
    else:
        data["score"] = data["submitted_answers"]["s"] / 100
