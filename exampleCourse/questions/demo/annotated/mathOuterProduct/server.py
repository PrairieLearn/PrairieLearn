import numpy as np
import prairielearn as pl

def generate(data):

    # Number of digits after the decimal point to display
    d = 3

    # Generate random vectors
    u = np.round(np.random.random(4),d)
    v = np.round(np.random.random(4),d)
    a = np.random.randint(1,10)
    b = np.random.randint(1,10)
    w = np.outer(a*u , b*v)

    # Release parameters
    data["params"]["u"] =  pl.to_json(u)
    data["params"]["v"] =  pl.to_json(v)
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["d"] = d
    data["params"]["d2"] = d + 1
    data["correct_answers"]["w"] = pl.to_json(w)
