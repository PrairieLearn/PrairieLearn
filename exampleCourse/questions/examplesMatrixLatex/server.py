

import random, math
import numpy as np
import prairielearn as pl
import scipy.linalg as sla

def generate(data):

    sf = 2

    # Matrix shape
    M = 3

    myNumber = 2.148233

    # Generating the orthogonal matrix U
    # (numbers rounded with 2 decimal digits)
    X = np.random.rand(M, M)
    Q,R = sla.qr(X)
    U = np.around(Q, sf + 1)

    b = np.random.rand(M)
    bc = b.reshape((M, 1))
    br = b.reshape(1, M)

    data['params']['sf'] = sf
    data['params']['M'] = M
    data['params']['U'] = pl.to_json(U)
    data['params']['myNumber'] = pl.to_json(myNumber)
    data['params']['b'] = pl.to_json(br)
    data['params']['c'] = pl.to_json(bc)


    return data
