import random

def generate(data):
    data["correct_answers"]["s"] = 100

def parse(data):
    if data["submitted_answers"]["s"] == 100:
        data["submitted_answers"]["s"] = 0
    elif data["submitted_answers"]["s"] == 80 or data["submitted_answers"]["s"] == 90:
        data["format_errors"]["s"] = "80 and 90 are invalid answers"

def grade(data):
    if data["submitted_answers"]["s"] == 50:
        data["score"] = 1
    else:
        data["score"] = data["submitted_answers"]["s"] / 100
