import random

THEME_PROMPTS = {
    "sports": "A track coach organizes {a} practice sessions, each with {b} laps.",
    "cooking": "A chef prepares {a} batches of cookies, with {b} cookies in each batch.",
    "travel": "A tour guide leads {a} tours, each visiting {b} stops.",
}
THEME_UNITS = {
    "sports": "laps",
    "cooking": "cookies",
    "travel": "stops",
}


def generate(data):
    # Falls back to the "sports" default if the "Pick an assessment theme"
    # question hasn't been visited yet in this assessment instance.
    theme = data["shared_state"]["assessmentTheme"]["theme"]

    a = random.randint(2, 9)
    b = random.randint(2, 9)

    data["params"]["prompt"] = THEME_PROMPTS[theme].format(a=a, b=b)
    data["params"]["unit"] = THEME_UNITS[theme]

    data["correct_answers"]["c"] = a * b
