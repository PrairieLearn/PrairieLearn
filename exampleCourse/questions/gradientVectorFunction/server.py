

import random, math
import numpy as np
import prairielearn as pl
import scipy.linalg as sla

def generate(data):

    f = np.array([[1],[2],[3]])
    g = np.random.rand(3,2)
    g = np.array([[2],[1]])

    #g = [['x',2.42345],[4,3.444433],[4,4]]
    data["params"]["f"] = pl.to_json(f)

    data["correct_answers"]["g"] = pl.to_json(g)


    return data
