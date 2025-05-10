import math
import random

import numpy as np
import prairielearn as pl


def generate(data):
    a = random.choice([-4, -2, 2, 4])
    matrix = np.zeros((2, 2))
    matrix[0, 0] = math.cos(math.pi / a)
    matrix[0, 1] = -math.sin(math.pi / a)
    matrix[1, 0] = math.sin(math.pi / a)
    matrix[1, 1] = math.cos(math.pi / a)
    if a < 0:
        data["params"]["a"] = "- \\frac{\\pi}{" + str(-a) + "}"
        data["params"]["b"] = "R_{-\\frac{\\pi}{" + str(-a) + "}}"
    else:
        data["params"]["a"] = "\\frac{\\pi}{" + str(a) + "}"
        data["params"]["b"] = "R_{\\frac{\\pi}{" + str(a) + "}}"
    matrix = np.around(matrix, 5)
    data["correct_answers"]["M"] = pl.to_json(matrix)
