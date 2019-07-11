import numpy as np

def generate(data):
    # Maximum number of digits after the decimal
    nDigits = 1

    # Bound on absolute value of numbers
    numMax = 10

    # Multiplier
    m = 10**nDigits

    # The two numbers to be multiplied
    a = np.random.random_integers(-m*numMax,m*numMax)/m
    b = np.random.random_integers(-m*numMax,m*numMax)/m

    # Product of these two numbers
    c = a*b

    # Sum of these two numbers
    d = a+b

    # Modify data and return
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["correct_answers"]["c"] = c
    data["correct_answers"]["d"] = d
