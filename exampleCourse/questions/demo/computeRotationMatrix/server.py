

import random, math
import numpy as np
import prairielearn as pl
def generate(data):

    a = random.choice([-4, -2, 2, 4])
    M = np.zeros((2, 2))
    M[0, 0] = math.cos(math.pi/a)
    M[0, 1] = -math.sin(math.pi/a)
    M[1, 0] = math.sin(math.pi/a)
    M[1, 1] = math.cos(math.pi/a)
    if a < 0:
        data["params"]["a"] = "- \\frac{\pi}{" + str(-a) + "}"
        data["params"]["b"] = "R_{-\\frac{\pi}{" + str(-a) + "}}"
    else:
        data["params"]["a"] = "\\frac{\pi}{" + str(a) + "}"
        data["params"]["b"] = "R_{\\frac{\pi}{" + str(a) + "}}"
    M = np.around(M,5)
    data["correct_answers"]["M"] = pl.to_json(M)
    return data
