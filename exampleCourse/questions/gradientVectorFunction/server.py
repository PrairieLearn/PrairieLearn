

import random, math
import numpy as np
import prairielearn as pl
import scipy.linalg as sla

def generate(data):

    a1 = random.randint(2,12)
    a2 = random.randint(2,12)
    b1 = random.randint(2,12)
    b2 = random.randint(2,12)
    c1 = random.randint(2,12)
    c2 = random.randint(2,12)

    x1 = random.choice([0,1,2])
    x2 = random.choice([0,1,2])

    g = [[2*a1*x1, a2],[-b2*2*x1,3*b1*(x2**2)],[-2*c1*x1,c2]]
    g = [[1,2],[3,4],[5,6]]


    data["params"]["a1"] = a1
    data["params"]["a2"] = a2
    data["params"]["b1"] = b1
    data["params"]["b2"] = b2
    data["params"]["c1"] = c1
    data["params"]["c2"] = c2
    data["params"]["x1"] = x1
    data["params"]["x2"] = x2

    data["correct_answers"]["g"] = pl.to_json(g)


    return data
