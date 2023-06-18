import random
import numpy as np
import prairielearn as pl



def generate(data):
    r = np.zeros(3)
    u = np.zeros(3)
    v = random.randint(2, 10)

    while np.linalg.norm(np.cross(u, r)) < 1:
        r = randIntNonZeroArray(3, -5, 5)
        u = randIntNonZeroArray(3, -5, 5)

    omegaHat = u / np.linalg.norm(u)
    omega = v / np.linalg.norm(np.cross(omegaHat, r))

    omegaHat = u / np.linalg.norm(u)
    omega = v / np.linalg.norm(np.cross(omegaHat, r))

    data["params"]["x"] = float(r[0])
    data["params"]["y"] = float(r[1])
    data["params"]["z"] = float(r[2])

    data["params"]["u_vec"] = cartesianVector(u)
    data["params"]["u"] = pl.to_json(u)

    data["params"]["v"] = v

    data["correct_answers"]["omega"] = omega

    return data

def randIntNonZeroArray(n, a, b, step=1):

    """n: size of the array
       a: lower bound of the range of integers
       b : upper bound of the range of integers
    returns a non-zero vector whose components are integers in the range [a,b]

    """

    r = np.zeros(n)

    while np.linalg.norm(r) == 0:
        if n == 2:
            r = np.array(
                [random.randrange(a, b, step), random.randrange(a, b, step), 0]
            )
        elif n == 3:
            r = np.array(
                [
                    random.randrange(a, b, step),
                    random.randrange(a, b, step),
                    random.randrange(a, b, step),
                ]
            )

    return r

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