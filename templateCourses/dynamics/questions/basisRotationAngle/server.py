import random

import numpy as np
import prairielearn as pl

def generate(data):
    theta = (random.randint(0, 3) / 2 + random.uniform(0.1, 0.4)) * np.pi
    u = np.array([np.cos(theta), np.sin(theta)])
    v = np.array([-float(u[1]), float(u[0])])

    r = np.round(np.array([random.uniform(3, 6), random.uniform(0, 2 * np.pi)]), 3)
    rUV = np.round(np.array([np.dot(r, u), np.dot(r, v)]), 3)

    data["params"]["rij_vec"] = cartesianVector(r)
    data["params"]["rUV_vec"] = vectorInBasis(rUV, "\\hat{u}", "\\hat{v}", "")
    data["params"]["rij"] = pl.to_json(r)
    data["params"]["ruv"] = pl.to_json(rUV)

    data["correct_answers"]["theta"] = theta

    return data

def vectorInBasis(v, basis1, basis2, basis3):
    """v: numpy array of size (3,)
    basis1: first basis vector
    basis2: second basis vector
    basis3: third basis vector, default ""
    """

    basis_list = [basis1, basis2, basis3]
    s = []
    e = 0
    v = v.tolist()
    for i in range(len(v)):
        if type(v[i]) == float:
            if v[i] == int(v[i]):
                v[i] = int(v[i])
        e = str(v[i])
        if e == "0":
            continue
        if e == "1" and basis_list[i] != "":
            e = ""
        if e == "-1" and basis_list[i] != "":
            e = "-"
        e += basis_list[i]
        if len(s) > 0 and e[0] != "-":
            e = "+" + e
        s.append(e)
    if len(s) == 0:
        s.append("0")
    return "".join(s)


def cartesianVector(v):
    return vectorInBasis(v, "\\hat{\\imath}", "\\hat{\\jmath}", "\\hat{k}")