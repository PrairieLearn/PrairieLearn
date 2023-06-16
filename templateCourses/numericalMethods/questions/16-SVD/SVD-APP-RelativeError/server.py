import random

import numpy as np
import prairielearn as pl


def generate(data):
    a = random.randint(3, 9)
    rank = random.randint(1, 3)
    b = random.randint(15, 29) / 10
    c = random.randint(7, 14) / 10
    d = random.randint(1, 6) / 10
    v = np.array([a, b, c, d])
    choice = v[rank]
    random.shuffle(v)
    A = np.diag(v)
    data["params"]["A"] = pl.to_json(A)
    data["params"]["rank"] = rank
    data["correct_answers"]["f"] = choice / a
    return data
