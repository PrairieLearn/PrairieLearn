import random

import numpy as np
import prairielearn as pl


def generate(data):
    n = 4

    # Randomly decide to generate a random or ring matrix.
    choice = random.choices(("random", "ring"), weights=[0.7, 0.3], k=1)[0]

    match choice:
        case "random":
            correct = np.random.choice([0, 1], size=(n, n), p=[0.5, 0.5])
        case "ring":
            shift = np.random.choice([1, -1]) * np.random.randint(1, n - 2)
            correct = np.roll(np.diag(np.ones(n)), shift)

    data["params"]["matrix"] = pl.to_json(correct.T)
    data["correct_answers"]["matrix"] = data["params"]["matrix"]
