import numpy as np
import prairielearn as pl


def generate(data):
    two_normed = "\\frac{1}{\sqrt{2}}"
    neg_tn = "-" + two_normed
    if np.random.choice([0, 1]):
        # defining elements of U
        data["params"]["U00"] = two_normed
        data["params"]["U01"] = neg_tn
        data["params"]["U10"] = two_normed
        data["params"]["U11"] = two_normed

        # defining elements of Vh
        data["params"]["Vh00"] = "1"
        data["params"]["Vh01"] = "0"
        data["params"]["Vh10"] = "0"
        data["params"]["Vh11"] = "1"
    else:
        # defining elements of U
        data["params"]["U00"] = "0"
        data["params"]["U01"] = "1"
        data["params"]["U10"] = "1"
        data["params"]["U11"] = "0"

        # defining elements of Vh
        data["params"]["Vh00"] = two_normed
        data["params"]["Vh01"] = two_normed
        data["params"]["Vh10"] = two_normed
        data["params"]["Vh11"] = neg_tn

    sv0, sv1 = np.random.randint(2, 15, size=2)
    data["params"]["sv0"] = str(sv0)
    data["params"]["sv1"] = str(sv1)

    y = np.random.randint(2, 13, size=(4, 1))
    data["params"]["y"] = pl.to_json(y)

    r = np.sqrt((y[2] ** 2) + (y[3] ** 2))[0]
    data["correct_answers"]["r"] = r
    return data
