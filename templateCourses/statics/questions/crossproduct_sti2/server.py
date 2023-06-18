import random

import numpy as np


def generate(data):

    # Sample two random integers between 5 and 10 (inclusive)
    a1 = random.randint(-5, 10)
    b1 = random.randint(-5, 10)
    c1 = random.randint(-5, 10)

    a2 = random.randint(-5, 10)
    b2 = random.randint(-5, 10)
    c2 = random.randint(-5, 10)

    # Put these two integers into data['params']
    data["params"]["a1"] = a1
    data["params"]["b1"] = b1
    data["params"]["c1"] = c1
    data["params"]["a2"] = a2
    data["params"]["b2"] = b2
    data["params"]["c2"] = c2

    Av = np.array([a1, b1, c1])
    Bv = np.array([a2, b2, c2])

    # Compute the cross product, A x B
    Cv = np.cross(Av, Bv)

    # Put the sum into data['correct_answers']
    data["correct_answers"]["ix"] = float(Cv[0])
    data["correct_answers"]["iy"] = float(Cv[1])
    data["correct_answers"]["iz"] = float(Cv[2])

    # data['correct_answers']['Cv'] = pl.to_json(Cv.reshape(1,3))
