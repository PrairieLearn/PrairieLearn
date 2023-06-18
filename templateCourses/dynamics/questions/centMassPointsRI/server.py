import random

import numpy as np
import prairielearn as pl
from sympy import *


def generate(data):
    mass = [i for i in range(1, 10)]
    r = [np.zeros(3) for i in range(3)]
    minDist = 0
    rC = np.zeros(3)
    x, y = symbols("x, y")

    while np.linalg.norm(r).any() == 0 and minDist < 2.5:
        m1 = random.choice(mass)
        m2 = random.choice(mass)
        m3 = random.choice(mass)
        r = [randIntNonZeroArray(2, -9, 9) for i in range(3)]
        rC = randIntNonZeroArray(2, -15, 15)
        minDist = min(
            np.linalg.norm(r[0] - r[1]),
            np.linalg.norm(r[1] - r[2]),
            np.linalg.norm(r[2] - r[1]),
            np.linalg.norm(rC - r[0]),
            np.linalg.norm(rC - r[1]),
            np.linalg.norm(rC - r[2]),
        )
        findI = random.randint(1, 3)
        if findI == 1:
            data["params"]["r1Expr"] = "\\text{unknown}"
            data["params"]["r2Expr"] = cartesianVector(r[1])
            data["params"]["r3Expr"] = cartesianVector(r[2])
            data["params"]["r2"] = pl.to_json(r[1])
            data["params"]["r3"] = pl.to_json(r[2])
            pl_var_output = '<variable params-name="r2">r2</variable><variable params-name="r3">r3</variable>'

            r1 = Matrix([x, y, 0])
            r2 = Matrix(r[1].tolist())
            r3 = Matrix(r[2].tolist())
            soln = solve(
                Eq(Matrix(rC.tolist()), (m1 * r1 + m2 * r2 + m3 * r3) / (m1 + m2 + m3)),
                (x, y),
            )
        elif findI == 2:
            data["params"]["r1Expr"] = cartesianVector(r[0])
            data["params"]["r2Expr"] = "\\text{unknown}"
            data["params"]["r3Expr"] = cartesianVector(r[2])
            data["params"]["r1"] = pl.to_json(r[0])
            data["params"]["r3"] = pl.to_json(r[2])
            pl_var_output = '<variable params-name="r1">r1</variable><variable params-name="r3">r3</variable>'

            r2 = Matrix([x, y, 0])
            r1 = Matrix(r[0].tolist())
            r3 = Matrix(r[2].tolist())
            soln = solve(
                Eq(Matrix(rC.tolist()), (m1 * r1 + m2 * r2 + m3 * r3) / (m1 + m2 + m3)),
                (x, y),
            )
        else:
            data["params"]["r1Expr"] = cartesianVector(r[0])
            data["params"]["r2Expr"] = cartesianVector(r[1])
            data["params"]["r3Expr"] = "\\text{unknown}"
            data["params"]["r1"] = pl.to_json(r[0])
            data["params"]["r2"] = pl.to_json(r[1])
            pl_var_output = '<variable params-name="r1">r1</variable><variable params-name="r2">r2</variable>'

            r3 = Matrix([x, y, 0])
            r1 = Matrix(r[0].tolist())
            r2 = Matrix(r[1].tolist())
            soln = solve(
                Eq(Matrix(rC.tolist()), (m1 * r1 + m2 * r2 + m3 * r3) / (m1 + m2 + m3)),
                (x, y),
            )

    data["correct_answers"]["ansValue1"] = float(soln[x])
    data["correct_answers"]["ansValue2"] = float(soln[y])
    data["params"]["m1"] = m1
    data["params"]["m2"] = m2
    data["params"]["m3"] = m3
    data["params"]["rC_vec"] = cartesianVector(rC)
    data["params"]["rC"] = pl.to_json(rC)
    data["params"]["findI"] = findI
    data["params"]["pl_var_output"] = pl_var_output
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
