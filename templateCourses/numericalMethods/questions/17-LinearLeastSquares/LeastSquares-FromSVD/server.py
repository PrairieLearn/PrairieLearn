import numpy as np
import prairielearn as pl


def generate(data):
    opt1 = "\\frac{1}{\sqrt{2}}"
    opt2 = "\\frac{\sqrt{3}}{2}"
    if np.random.choice([0, 1]):
        # defining elements of Vh
        data["params"]["Vh00"] = opt1
        data["params"]["Vh01"] = "-" + opt1
        data["params"]["Vh10"] = opt1
        data["params"]["Vh11"] = "-" + opt1
        v1 = np.array([1 / np.sqrt(2), -1 / np.sqrt(2), 0])
    else:
        # defining elements of Vh
        data["params"]["Vh00"] = "-" + opt2
        data["params"]["Vh01"] = "\\frac{1}{2}"
        data["params"]["Vh10"] = "-\\frac{1}{2}"
        data["params"]["Vh11"] = "-" + opt2
        v1 = np.array([-np.sqrt(3) / 2, 1 / 2, 0])

    sv0, sv1 = np.random.randint(2, 10, size=2)
    data["params"]["sv0"] = str(sv0)
    data["params"]["sv1"] = str(sv1)

    y = np.zeros((3, 1))
    y[0] = np.random.randint(2, 10)
    data["params"]["y"] = pl.to_json(y)

    x = (y[0] / sv0) * v1

    data["correct_answers"]["x"] = pl.to_json(x[:, np.newaxis])
    return data
