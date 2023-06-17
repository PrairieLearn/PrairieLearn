import random

import numpy as np
import prairielearn as pl
from pl_random import *
from pl_template import *


def generate(data):
    r = randIntNonZeroArray(2, -4, 4)
    omega = np.array([0, 0, randIntNonZero(-3, 3)])

    v = np.cross(omega, r)

    data["params"]["r_vec"] = cartesianVector(r)
    data["params"]["omega"] = float(omega[2])
    data["params"]["r"] = pl.to_json(r)

    data["correct_answers"]["vx"] = float(v[0])
    data["correct_answers"]["vy"] = float(v[1])

    return data
