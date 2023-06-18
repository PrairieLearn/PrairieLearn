import random
import numpy as np
import prairielearn as pl
from sympy import *


def generate(data):
    QPos = random.choice(["left", "top", "right"])
    r = random.randint(2, 9)
    s = random.choice([-1, 1])
    omega = s * random.randint(2, 9)

    if QPos == "left":
        vQ = np.array([1, 1, 0]) * (-s * random.randint(2, 9))
        rCQHat = np.array([-1, 0, 0])
        Qx = 200
        Qy = 150
    elif QPos == "top":
        vQ = np.array([-s * random.randint(2, 9), 0, 0])
        rCQHat = np.array([0, 1, 0])
        Qx = 300
        Qy = 50
    else:
        vQ = np.array([1, -1, 0]) * (-s * random.randint(2, 9))
        rCQHat = np.array([1, 0, 0])
        Qx = 400
        Qy = 150

    defs = NChoice(2, ["r", "omega"])
    givenDef = defs[0]
    ansDef = defs[1]

    if ansDef == "r":
        ansVar = "r"
        ansDescription = "radius"
        ansUnits = "\\rm\\ m"
        givenVar = "omega"
        data["params"]["givenVar"] = givenVar
        data["params"][givenVar] = pl.to_json(np.array([0, 0, omega]))
        givenExp = (
            "angular velocity $\\vec\\omega = "
            + cartesianVector(np.array([0, 0, omega]))
            + "\\rm\\ rad/s$"
        )
    else:
        ansVar = "\\vec\\omega"
        ansDescription = "angular velocity"
        ansUnits = "\\hat{k}{\\rm\\ rad/s}"
        givenVar = "r"
        data["params"]["givenVar"] = givenVar
        data["params"][givenVar] = r
        givenExp = "radius $r = " + f"{r}" + "\\rm\\ m$"

    vQDir = perp(rCQHat) + np.array([-1, 0, 0])

    if ansDef == "r":
        ansValue = np.dot(vQ, vQDir) / omega / np.dot(vQDir, vQDir)
    else:
        ansValue = np.dot(vQ, vQDir) / r / np.dot(vQDir, vQDir)

    data["params"]["vQ_vec"] = cartesianVector(vQ)
    data["params"]["vQ"] = pl.to_json(vQ)
    data["params"]["QPos"] = QPos
    data["params"]["givenExp"] = givenExp
    data["params"]["ansVar"] = ansVar
    data["params"]["ansDescription"] = ansDescription
    data["params"]["ansUnits"] = ansUnits
    data["params"]["Qx"] = float(Qx)
    data["params"]["Qy"] = float(Qy)

    data["correct_answers"]["ansValue"] = ansValue

    return data


def perp(v):
    """v: numpy array of size (n,)
       n: size of the array
    returns the counterclockwise orthogonal vector to v
    """
    return np.array([-v[1], v[0], 0])

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

def NChoice(n, l):
    if n > len(l):
        return l

    choice = []

    for i in range(n):
        x = random.choice(l)
        choice.append(x)
        l.remove(x)
    return choice



