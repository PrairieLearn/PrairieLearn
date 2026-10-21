import math
import random


def generate(data):
    a = round(random.uniform(1, 10), 2)
    b = round(random.uniform(2, 5), 2)
    answer = a + b

    data["params"]["a"] = a
    data["params"]["b"] = b
    data["correct_answers"]["answer"] = answer  # tolerance: 0.01
