import random

import numpy as np
import prairielearn as pl
from pl_random import *
from pl_template import *


def generate(data):
    rP = randIntNonZeroArray(2, -5, 5)
    vP = randIntNonZeroArray(2, -5, 5)
    omega = np.array([0, 0, randIntNonZero(-5, 5)])

    rPM = np.cross(omega, vP) * 1 / np.dot(omega, omega)
    rM = rP + rPM

    data["params"]["rP_vec"] = cartesianVector(rP)
    data["params"]["vP_vec"] = cartesianVector(vP)
    data["params"]["omega_vec"] = cartesianVector(omega)

    data["params"]["omega"] = pl.to_json(omega)
    data["params"]["rP"] = pl.to_json(rP)
    data["params"]["vP"] = pl.to_json(vP)

    data["correct_answers"]["rMx"] = float(rM[0])
    data["correct_answers"]["rMy"] = float(rM[1])

    return data
