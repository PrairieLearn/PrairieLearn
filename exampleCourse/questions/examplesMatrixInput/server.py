

import random, math
import numpy as np
import prairielearn as pl
import scipy.linalg as sla
import to_precision

def generate(data):


    A =  np.random.rand(2,2)

    dig = 3
    sf = 1
    B = np.round(A,dig)
    C = B.copy()

    for ix,iy in np.ndindex(B.shape):
        C[ix,iy]=to_precision.to_precision(C[ix,iy],sf)

    x =  np.array([[1,2,3,4]])

    data["params"]["dig"] = dig
    data["params"]["sf"] = sf
    data["params"]["in"] = pl.to_json(B)
    data["params"]["x"] = pl.to_json(x)

    data["correct_answers"]["out1"] = pl.to_json(C)
    data["correct_answers"]["out2"] = pl.to_json(C)
    data["correct_answers"]["out3"] = pl.to_json(x)

    return data
