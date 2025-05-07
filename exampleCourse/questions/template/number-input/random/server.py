import math
import random

import prairielearn as pl


def generate(data: pl.QuestionData):
    # Sample a random decimal number in the tenths place between 1.1 and 5
    a = round(random.uniform(1.1, 5), 1)

    # Sample an integer number between 6 and 11
    b = random.randint(6, 11)

    # Put these two decimal numbers into data['params']
    data["params"]["a"] = a
    data["params"]["b"] = b

    # Compute the product of these two numbers
    c = math.sqrt(a**2 + b**2)

    # Put the correct answer into data['correct_answers']
    data["correct_answers"]["c"] = c
