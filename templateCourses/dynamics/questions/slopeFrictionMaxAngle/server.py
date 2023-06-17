import random

import numpy as np
import prairielearn as pl
from pl_draw import *
from pl_geom import *
from pl_random import *
from pl_template import *


def generate(data):
    thetaSign = random.choice([-1, 1])
    m = random.randint(3, 9)
    mu = random.randint(1, 15) / 8

    theta = np.arctan(mu)
    thetaDeg = np.degrees(theta)

    data["params"]["m"] = m
    data["params"]["mu"] = mu

    data["params"]["drawAngleGround"] = groundAtAngle([215, 140], 45, 500)

    data["correct_answers"]["theta"] = thetaDeg

    return data
