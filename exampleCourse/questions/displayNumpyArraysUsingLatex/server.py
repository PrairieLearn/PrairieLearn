

import random, math
import numpy as np
import prairielearn as pl
import scipy.linalg as sla

def generate(data):

    sf = 2

    # Matrix shape
    M = 3

    # Generating the orthogonal matrix U
    # (numbers rounded with 2 decimal digits)
    X = np.random.rand(M,M)
    Q,R = sla.qr(X)
    U = np.around(Q,sf+1)

    b = np.random.rand(M+3)
    c = np.random.rand(M,1)

    x = np.array([['x'],['y'],['z']])


    data["params"]["sf"] = sf
    data["params"]["M"] = M
    data["params"]["U"] = pl.to_json(U)
    data["params"]["b"] = pl.to_json(b)
    data["params"]["c"] = pl.to_json(c)
    data["params"]["x"] = pl.to_json(x)




    return data
