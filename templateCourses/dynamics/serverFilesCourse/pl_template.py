import numpy as np


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


def polarVector(v):
    return vectorInBasis(v, "\\hat{e}_r", "\\hat{e}_{\\theta}", "\\hat{k}")


def PL_angle(x):
    """x: angle measured counterclockwise from the x
    returns the adjusted angle for pl-drawing"""

    if x > 0:
        x_pl = -x
    else:
        x_pl = abs(x)

    return x_pl


def rgb_to_hex(rgb):
    return ("#%02x%02x%02x" % rgb).upper()
