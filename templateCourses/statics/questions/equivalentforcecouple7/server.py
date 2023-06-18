import math
import random

import numpy as np


def generate(data):

    # Randomize car geometry

    alpha = random.randint(25, 45)
    beta = random.randint(25, 45)

    Fg = random.randint(20, 40)
    Fi = Fg * 0.8
    Fq = 1.2 * Fg

    a = random.randint(40, 50)
    b = 0.8 * a
    c = 0.2 * a
    d = 0.1 * a

    alpharad = alpha / 180 * math.pi
    betarad = beta / 180 * math.pi

    # sum forces
    Fx = (Fi * (math.cos(betarad))) - (Fg * (math.cos(alpharad)))
    Fy = (Fi * (math.sin(betarad))) + (Fg * (math.sin(alpharad))) + Fq
    Fz = 0

    # sum moment
    rg = [-c, a, 0]
    fg = [(-Fg * (math.cos(alpharad))), (Fg * (math.sin(alpharad))), 0]
    mfg = np.cross(rg, fg) / 100

    ri = [d, b, 0]
    fi = [(Fi * (math.cos(betarad))), (Fi * (math.sin(betarad))), 0]
    mfi = np.cross(ri, fi) / 100

    m = mfg + mfi

    mx = m[0]
    my = m[1]
    mz = m[2]

    data["params"]["alpha"] = alpha
    data["params"]["beta"] = beta
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c
    data["params"]["d"] = d
    data["params"]["Fg"] = Fg
    data["params"]["Fi"] = Fi
    data["params"]["Fq"] = Fq

    data["correct_answers"]["Fx"] = Fx
    data["correct_answers"]["Fy"] = Fy
    data["correct_answers"]["Fz"] = Fz
    data["correct_answers"]["mx"] = mx
    data["correct_answers"]["my"] = my
    data["correct_answers"]["mz"] = mz

    return data
