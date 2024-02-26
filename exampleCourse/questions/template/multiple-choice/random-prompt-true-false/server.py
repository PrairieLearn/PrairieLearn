import random


def generate(data):
    # Create a list of question prompts and the corresponding answers.
    scenarios = [
        ("North", True),
        ("South", False),
        ("West", False),
        ("East", False),
    ]

    # Select a random scenario.
    scenario_statement, scenario_answer = random.choice(scenarios)

    # Depending on the truth statement, set the appropriate prompt and answers.
    data["params"]["question_prompt"] = scenario_statement
    data["params"]["true_answer"] = scenario_answer
    data["params"]["false_answer"] = not scenario_answer
