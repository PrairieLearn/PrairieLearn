import random, math
import numpy as np
import prairielearn as pl
import scipy.linalg as sla
import to_precision

def generate(data):

    N = 2
    A =  np.random.rand(N,N)
    sf = 2
    B = np.round(A,sf)
    x =  np.array([[1,2,3,4]])
    long_matrix = np.array([[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]])

    data["params"]["sf"] = sf
    data["params"]["in"] = pl.to_json(B)
    data["params"]["x"] = pl.to_json(x)

    data["correct_answers"]["out1"] = pl.to_json(B)
    data["correct_answers"]["out2"] = pl.to_json(B)
    data["correct_answers"]["out3"] = pl.to_json(x)
    data["correct_answers"]["out4"] = pl.to_json(long_matrix)

    return data
