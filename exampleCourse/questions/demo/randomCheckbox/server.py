import random, math
import numpy as np
import numpy.linalg as la
import scipy.linalg as sla
import prairielearn as pl

def generate(data):
    N = random.choice([2,3])
    data["params"]["N"] = N
    for i in range(2):
        X = np.random.rand(N,N)
        name = "N" + str(i+1)
        data["params"][name] = pl.to_json(X)
    for i in range(4):
        M = random.choice([j for j in range(2,5) if j not in [N]])
        X = np.random.rand(M,M)
        name = "M" + str(i+1)
        data["params"][name] = pl.to_json(X)
    return data