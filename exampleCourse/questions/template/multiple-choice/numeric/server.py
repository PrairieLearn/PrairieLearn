import random


def generate(data):
    # Sample a random decimal number in the tenths place between 1.1 and 5.
    a = round(random.uniform(1.1, 5), 1)

    # Sample an integer number between 6 and 11.
    b = random.randint(6, 11)

    # Compute the product of these two numbers.
    c = a * b

    # Store the parameters and the correct answer.
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["correct_answer"] = round(c, 4)

    # Generate three distractors by changing the operation.
    data["params"]["wrong_answer1"] = round((a - 1) * b, 4)
    data["params"]["wrong_answer2"] = round(b - a, 4)
    data["params"]["wrong_answer3"] = round((a + 1) * b, 4)
