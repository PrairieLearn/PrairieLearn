import random

STATES_WITH_LOCATIONS = [
    ("ak", 80, 400),
    ("tx", 350, 350),
    ("az", 150, 290),
    ("nm", 220, 290),
    ("ut", 160, 205),
    ("co", 230, 220),
    ("wy", 230, 150),
    ("mt", 230, 70),
    ("nd", 310, 70),
    ("sd", 310, 125),
    ("nv", 90, 190),
    ("or", 50, 100),
]


def generate(data):
    abbreviation, x, y = random.choice(STATES_WITH_LOCATIONS)

    data["correct_answers"]["state"] = abbreviation
    data["params"]["x"] = x
    data["params"]["y"] = y
