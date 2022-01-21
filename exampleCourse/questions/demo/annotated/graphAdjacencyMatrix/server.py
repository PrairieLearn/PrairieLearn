import random
import numpy as np
import numpy.linalg as la
import prairielearn as pl

def generate(data):
    n = 4
    choice = np.random.choice(np.arange(2,dtype='int'), p=[.7, .3])
    if choice == 0:
        # random graph
        correct = np.random.choice([0,1],size=(n,n), p=[0.5,0.5])
    elif choice == 1:
        # ring
        shift = np.random.choice([1, -1])*np.random.randint(1, n-2)
        correct = np.roll(np.diag(np.ones(n)), shift)

    data["correct_answers"]["mat"] = pl.to_json(correct.T)
    data["params"]["mat"] = data["correct_answers"]["mat"]
    return data
