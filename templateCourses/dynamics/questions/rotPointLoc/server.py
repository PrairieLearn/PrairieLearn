import random

import numpy as np
import prairielearn as pl
from pl_random import *
from pl_template import *


def generate(data):

    v = randIntNonZeroArray(2, -4, 4)

    omega = np.array([0, 0, random.choice([-1, 1]) * random.randint(2, 5)])

    rperp = v / float(omega[2])

    r = np.array([float(rperp[1]), float(-rperp[0])])

    data["params"]["omega"] = float(omega[2])
    data["params"]["v_vec"] = cartesianVector(v)
    data["params"]["v"] = pl.to_json(v)

    data["correct_answers"]["rx"] = float(r[0])
    data["correct_answers"]["ry"] = float(r[1])

    return data
