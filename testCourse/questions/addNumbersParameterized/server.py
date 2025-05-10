import random


def generate(data):
    lower_bound = data["params"].get("lower_bound", 10)
    upper_bound = data["params"].get("upper_bound", 15)

    # Sample two random integers between 5 and 10 (inclusive)
    a = random.randint(lower_bound, upper_bound)
    b = random.randint(lower_bound, upper_bound)

    # Put these two integers into data['params']
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["lower_bound"] = lower_bound
    data["params"]["upper_bound"] = upper_bound
    # Compute the sum of these two integers
    c = a + b

    # Put the sum into data['correct_answers']
    data["correct_answers"]["c"] = c
