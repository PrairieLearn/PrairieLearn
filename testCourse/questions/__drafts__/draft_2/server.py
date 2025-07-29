import math
import random

def generate(data):
    # Generate two random float numbers for legs a and b
    a = round(random.uniform(1.0, 10.0), 1)
    b = round(random.uniform(1.0, 10.0), 1)

    # Store a and b in params for later use in the HTML
    data["params"]["a"] = a
    data["params"]["b"] = b

    # Calculate the hypotenuse using the Pythagorean theorem
    c = math.sqrt(a**2 + b**2)

    # Store the correct answer
    data["correct_answers"]["c"] = c
