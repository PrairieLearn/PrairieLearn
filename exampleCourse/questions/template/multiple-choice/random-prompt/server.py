import random


def generate(data):
    # Create a list of question prompts and the corresponding answers.
    scenarios = [
        ("closest to", "Mercury"),
        ("2nd away from", "Venus"),
        ("3rd away from", "Earth"),
        ("4th away from", "Mars"),
        ("5th away from", "Jupiter"),
        ("6th away from", "Saturn"),
        ("7th away from", "Uranus"),
        ("farthest from", "Neptune"),
    ]

    # Randomize the order of the scenarios.
    selected_scenarios = random.sample(scenarios, 4)

    # First shuffled scenario is the one we will take as correct.
    data["params"]["question_prompt"] = selected_scenarios[0][0]
    data["params"]["correct_answer"] = selected_scenarios[0][1]

    # Next three shuffled scenarios are the distractors.
    data["params"]["wrong_answer1"] = selected_scenarios[1][1]
    data["params"]["wrong_answer2"] = selected_scenarios[2][1]
    data["params"]["wrong_answer3"] = selected_scenarios[3][1]
