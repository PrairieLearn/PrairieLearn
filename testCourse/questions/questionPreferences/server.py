import random


def generate(data):
    # Randomly select mass from a list of options
    mass_options = [2, 5, 10, 15, 20, 25, 50]
    m = random.choice(mass_options)

    # Retrieve gravitational constant from user preferences
    g = float(data["preferences"]["gravitational_constant"])

    # Calculate correct force F = ma
    f_correct = m * g

    # Generate distractors based on common calculation errors
    f_x1 = m  # Used mass instead of force
    f_x2 = m / g  # Divided instead of multiplied
    f_x3 = g / m  # Inverse division
    f_x4 = m * g * 10  # Off by a factor

    # Assign parameters for the HTML template
    data["params"]["m"] = m
    data["params"]["F_c"] = f"{f_correct:.1f} N"
    data["params"]["F_x1"] = f"{f_x1:.1f} N"
    data["params"]["F_x2"] = f"{f_x2:.1f} N"
    data["params"]["F_x3"] = f"{f_x3:.1f} N"
    data["params"]["F_x4"] = f"{f_x4:.1f} N"

    # Randomize whether "None of the above" is an option
    data["params"]["none"] = random.choice(["true", "false"])
