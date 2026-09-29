import random

import numpy as np
import prairielearn as pl


def generate(data):
    a, b = random.randint(2, 5), random.randint(2, 5)
    data["params"].update(a=a, b=b)
    data["correct_answers"]["product"] = pl.to_json(
        np.array([[2 * a + 3], [-2 + 3 * b]])
    )
    data["correct_answers"]["determinant"] = a * b + 1
