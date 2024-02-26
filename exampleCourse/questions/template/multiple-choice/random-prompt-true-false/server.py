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
    scenario = random.choice(scenarios)

    # Depending on the truth statement, set the appropriate prompt and answers.
    data["params"]["question_prompt"] = scenario[0]
    data["params"]["true_answer"] = scenario[1]
    data["params"]["false_answer"] = not scenario[1]
