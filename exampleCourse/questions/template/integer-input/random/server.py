import random


def generate(data):
    # Create a list of angles in radians and their corresponding angles in degrees.
    angle_options = [("\\pi/2", 90), ("\\pi/4", 45), ("\\pi/3", 60), ("\\pi/6", 30)]

    # Select one of the entries of the list.
    angle_radians, angle_degrees = random.choice(angle_options)

    # Set the prompt and correct answer.
    data["params"]["angle_radians"] = angle_radians
    data["correct_answers"]["angle_degrees"] = angle_degrees
