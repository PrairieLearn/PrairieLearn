import random

def generate(data):
    data["correct_answers"]["s"] = 100

def grade(data):
    data["score"] = data["submitted_answers"]["s"] / 100
