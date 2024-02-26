import random


def generate(data):
    # Create a list of angles in radians and their corresponding angles in degrees.
    angles_radians = [("\\pi/2", 90), ("\\pi/4", 45), ("\\pi/3", 60), ("\\pi/6", 30)]

    # Select one of the entries of the list.
    option = random.choice(angles_radians)

    # Set the prompt and correct answer.
    data["params"]["angle_radians"] = option[0]
    data["correct_answers"]["angle_degrees"] = option[1]
