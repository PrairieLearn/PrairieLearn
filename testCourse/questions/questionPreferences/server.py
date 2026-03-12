import random


def generate(data):
    # Randomly select mass from a list of options
    m = random.choice([2, 5, 10, 15, 20, 25, 50])

    # Retrieve the configured gravitational constant from the question preferences
    g = float(data["preferences"]["gravitational_constant"])

    # Assign parameters for the HTML template
    data["params"]["m"] = m
    data["correct_answers"]["force"] = m * g
