import random
import numpy as np
import prairielearn as pl


def generate(data):
    QPos = random.choice(["left", "top", "right"])
    r = random.randint(2, 9)
    s = random.choice([-1, 1])
    omega = random.randint(2, 9)
    alpha = s * random.randint(2, 9)

    if QPos == "left":
        aQ = np.array([1, 1, 0]) * (-s * random.randint(2, 9)) + np.array(
            [random.randint(2, 9), 0, 0]
        )
        Qx = 90
        Qy = 95
        rCQHat = np.array([-1, 0, 0])
    elif QPos == "top":
        aQ = np.array([-s * random.randint(2, 9), 0, 0]) + np.array(
            [0, -random.randint(2, 9), 0]
        )
        Qx = 150
        Qy = 35
        rCQHat = np.array([0, 1, 0])
    else:
        aQ = np.array([1, -1, 0]) * (-s * random.randint(2, 9)) + np.array(
            [-random.randint(2, 9), 0, 0]
        )
        Qx = 210
        Qy = 95
        rCQHat = np.array([1, 0, 0])

    rCQHatPerp = perp(rCQHat)
    rAlphaDir = rCQHatPerp + np.array([-1, 0, 0])
    rAlphaDirPerp = perp(rAlphaDir)

    givenExp = random.choice(["r", "alpha", "omega"])

    if givenExp == "r":
        givenExp = "radius $r = " + str(r) + "\\rm\\ m$"
        data["params"]["r"] = r
        data["params"]["givenVar"] = "r"
        alpha = np.dot(aQ, rCQHatPerp) / r / np.dot(rAlphaDir, rCQHatPerp)
        omega = np.sqrt(
            np.dot(aQ, rAlphaDirPerp) / (-r) / np.dot(rCQHat, rAlphaDirPerp)
        )
        questionStatement = random.choice(
            ["angular acceleration", "angular velocity magnitude"]
        )
        if questionStatement == "angular acceleration":
            ansValue = alpha
            ansLabel = "$\\vec{\\alpha}$"
            ansUnits = "\\,\\hat{k}\\rm\\ rad/s^2"
        else:
            ansValue = omega
            ansLabel = "$||\\vec{\\omega}||$"
            ansUnits = "\\rm\\ rad/s"
    elif givenExp == "omega":
        givenExp = (
            "angular velocity $\\vec\\omega = "
            + cartesianVector(np.array([0, 0, omega]))
            + "\\rm\\ rad/s$"
        )
        data["params"]["omega"] = pl.to_json(np.array([0, 0, omega]))
        data["params"]["givenVar"] = "omega"
        r = np.dot(aQ, rAlphaDirPerp) / (-(omega**2)) / np.dot(rCQHat, rAlphaDirPerp)
        alpha = np.dot(aQ, rCQHatPerp) / r / np.dot(rAlphaDir, rCQHatPerp)
        questionStatement = random.choice(["angular acceleration", "radius"])
        if questionStatement == "angular acceleration":
            ansValue = alpha
            ansLabel = "$\\vec{\\alpha}$"
            ansUnits = "\\,\\hat{k}\\rm\\ rad/s^2"
        else:
            ansValue = r
            ansLabel = "$r$"
            ansUnits = "\\rm\\ m"
    else:
        givenExp = (
            "angular acceleration $\\vec\\alpha = "
            + cartesianVector(np.array([0, 0, alpha]))
            + "\\rm\\ rad/s^2$"
        )
        data["params"]["alpha"] = pl.to_json(np.array([0, 0, alpha]))
        data["params"]["givenVar"] = "alpha"
        r = np.dot(aQ, rCQHatPerp) / alpha / np.dot(rAlphaDir, rCQHatPerp)
        omega = np.sqrt(
            np.dot(aQ, rAlphaDirPerp) / (-r) / np.dot(rCQHat, rAlphaDirPerp)
        )
        questionStatement = random.choice(["angular velocity magnitude", "radius"])
        if questionStatement == "angular velocity magnitude":
            ansValue = omega
            ansLabel = "$|\\vec{\\omega}|$"
            ansUnits = "\\rm\\ rad/s"
        else:
            ansValue = r
            ansLabel = "$r$"
            ansUnits = "\\rm\\ m"

    data["params"]["aQ_vec"] = cartesianVector(aQ)
    data["params"]["aQ"] = pl.to_json(aQ)
    data["params"]["QPos"] = QPos
    data["params"]["givenExp"] = givenExp
    data["params"]["questionStatement"] = questionStatement
    data["params"]["ansLabel"] = ansLabel
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



