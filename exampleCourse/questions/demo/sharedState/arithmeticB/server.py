import random

THEME_PROMPTS = {
    "sports": "A stadium has {a} seats, and {b} tickets have already been sold.",
    "cooking": "A recipe calls for {a} cups of flour, and the chef has already added {b} cups.",
    "travel": "A flight covers {a} miles, and the plane has already flown {b} miles.",
}
THEME_QUESTIONS = {
    "sports": "How many seats are still empty?",
    "cooking": "How many more cups of flour are needed?",
    "travel": "How many miles are left to fly?",
}


def generate(data):
    # Falls back to the "sports" default if the "Pick an assessment theme"
    # question hasn't been visited yet in this assessment instance.
    theme = data["shared_state"]["assessmentTheme"]["theme"]

    a = random.randint(10, 20)
    b = random.randint(1, a - 1)

    data["params"]["prompt"] = THEME_PROMPTS[theme].format(a=a, b=b)
    data["params"]["question"] = THEME_QUESTIONS[theme]

    data["correct_answers"]["c"] = a - b
