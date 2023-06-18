import random

import numpy as np
import prairielearn as pl


def generate(data):
    r0 = np.zeros(3)
    rf = np.zeros(3)

    while np.linalg.norm(rf - r0) < 4:
        r0 = np.array([randIntNonZero(-9, 9), randIntNonZero(-9, 9), 0])
        rf = np.array([randIntNonZero(-9, 9), randIntNonZero(-9, 9), 0])

    F = np.array([randIntNonZero(-9, 9), randIntNonZero(-9, 9), 0])

    m = random.randint(2, 9)
    tf = random.randint(3, 7)

    W = np.dot(F, rf - r0)

    data["params"]["r0vec"] = cartesianVector(r0)
    data["params"]["rfvec"] = cartesianVector(rf)
    data["params"]["Fvec"] = cartesianVector(F)

    data["params"]["r0"] = pl.to_json(r0)
    data["params"]["rf"] = pl.to_json(rf)
    data["params"]["F"] = pl.to_json(F)

    data["params"]["m"] = float(m)
    data["params"]["t0"] = 0.0
    data["params"]["tf"] = float(tf)

    data["correct_answers"]["W"] = float(W)

    return data


def randIntNonZero(a, b):
    """a: lower bound of the range of integers
       b: upper bound of the range of integers
    returns a non-zero integer in the range [a,b]
    """

    x = 0
    while x == 0:
        x = random.randint(a, b)

    return x


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
