import random


def generate(data):
    # Read the lower and upper bounds on the random range from the question parameters.
    print(data)
    # lower_bound = data["params"]["questionParams"].get("lower_bound", 0)
    # upper_bound = data["params"]["questionParams"].get("upper_bound", 10)
    lower_bound = data["params"].get("lower_bound", 0)
    upper_bound = data["params"].get("upper_bound", 5)
    print(f"Lower bound: {lower_bound}, Upper bound: {upper_bound}\n")
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
