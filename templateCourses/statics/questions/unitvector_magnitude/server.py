import random

import numpy as np


def generate(data):

    mag = random.randint(5, 10)
    ax = random.randint(5, 10)
    ay = random.randint(5, 10)
    az = random.randint(5, 10)

    bx = random.randint(5, 10)
    by = random.randint(5, 10)
    bz = random.randint(5, 10)

    figurelist = ["Variant1.PNG", "Variant2.PNG", "Variant3.PNG"]
    which2 = random.choice([0, 1, 2])
    figure = figurelist[which2]
    variant = random.choice([0, 1])

    # Put these two integers into data['params']
    data["params"]["fig"] = figure
    data["params"]["ax"] = ax
    data["params"]["ay"] = ay
    data["params"]["az"] = az
    data["params"]["bx"] = bx
    data["params"]["by"] = by
    data["params"]["bz"] = bz
    data["params"]["mag"] = mag

    A = np.array([ax, ay, az])
    B = np.array([bx, by, bz])
    data["params"]["variant"] = variant
    if variant == 0:
        vec1 = np.array([bx - ax, by - ay, bz - az])
        data["params"]["label"] = "AB"
    elif variant == 1:
        vec1 = np.array([ax - bx, ay - by, az - bz])
        data["params"]["label"] = "BA"
    vec1_hat = vec1 / np.linalg.norm(vec1)
    vec_AB = mag * vec1_hat

    data["correct_answers"]["vec_AB_ix"] = vec_AB[0]
    data["correct_answers"]["vec_AB_iy"] = vec_AB[1]
    data["correct_answers"]["vec_AB_iz"] = vec_AB[2]
    # data['correct_answers']['vec_AB'] = pl.to_json(vec_AB.reshape(1,3))

    return data
