import random

import numpy as np
import prairielearn as pl
from pl_random import *
from pl_template import *


def generate(data):
    omega = np.array([0, 0, random.randint(-2, 2)])
    alpha = np.array([0, 0, random.randint(-2, 2)])
    aP = np.array([random.randint(-5, 5), random.randint(-5, 5), 0])
    rPQ = randIntNonZeroArray(2, -5, 5)

    aQ = aP + np.cross(alpha, rPQ) + np.cross(omega, np.cross(omega, rPQ))

    if np.linalg.norm(omega) == 0:
        data["params"]["omega_vec"] = 0
    else:
        data["params"]["omega_vec"] = cartesianVector(omega)
    if np.linalg.norm(alpha) == 0:
        data["params"]["alpha_vec"] = 0
    else:
        data["params"]["alpha_vec"] = cartesianVector(alpha)
    data["params"]["rPQ_vec"] = cartesianVector(rPQ)
    data["params"]["aP_vec"] = cartesianVector(aP)

    data["params"]["alpha"] = pl.to_json(alpha)
    data["params"]["omega"] = pl.to_json(omega)
    data["params"]["rPQ"] = pl.to_json(rPQ)
    data["params"]["aP"] = pl.to_json(aP)

    data["correct_answers"]["aQx"] = float(aQ[0])
    data["correct_answers"]["aQy"] = float(aQ[1])

    return data
