import random

import numpy as np
import prairielearn as pl
from pl_draw import *
from pl_geom import *
from pl_random import *
from pl_template import *


def generate(data):
    r0 = np.zeros(3)
    rf = np.zeros(3)

    while np.linalg.norm(rf - r0) < 4:
        r0 = np.array([randIntNonZero(-9, 9), randIntNonZero(-9, 9), 0])
        rf = np.array([randIntNonZero(-9, 9), randIntNonZero(-9, 9), 0])

    F = np.array([randIntNonZero(-9, 9), randIntNonZero(-9, 9), 0])

    m = random.randint(2, 9)
    tf = random.randint(3, 7)

    W = np.dot(F, rf - r0)

    data["params"]["r0vec"] = cartesianVector(r0)
    data["params"]["rfvec"] = cartesianVector(rf)
    data["params"]["Fvec"] = cartesianVector(F)

    data["params"]["r0"] = pl.to_json(r0)
    data["params"]["rf"] = pl.to_json(rf)
    data["params"]["F"] = pl.to_json(F)

    data["params"]["m"] = float(m)
    data["params"]["t0"] = 0.0
    data["params"]["tf"] = float(tf)

    data["correct_answers"]["W"] = float(W)

    return data
