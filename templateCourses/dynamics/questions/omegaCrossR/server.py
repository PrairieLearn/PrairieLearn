import random
import numpy as np
import prairielearn as pl


def generate(data):
    omega = np.array([0, 0, randIntNonZero(-4, 4)])
    r = randIntNonZeroArray(2, -5, 5)

    quantity_list = ["\\vec{v}", "\\vec{a}"]
    v_expr_list = ["\\vec\\omega \\times \\vec{r}", "\\omega \\vec{r}^\\perp"]
    a_expr_list = [
        "\\vec\\omega \\times (\\vec\\omega \\times \\vec{r})",
        "-\\omega^2 \\vec{r}",
    ]

    quantity = random.choice(quantity_list)

    if quantity == "\\vec{v}":
        expr = random.choice(v_expr_list)
        v = np.cross(omega, r)
        data["correct_answers"]["ansValue1"] = float(v[0])
        data["correct_answers"]["ansValue2"] = float(v[1])
        data["correct_answers"]["ansValue3"] = float(v[2])
        data["params"]["units"] = "{\\rm\\ m/s}"
    else:
        expr = random.choice(a_expr_list)
        a = np.cross(omega, np.cross(omega, r))
        data["correct_answers"]["ansValue1"] = float(a[0])
        data["correct_answers"]["ansValue2"] = float(a[1])
        data["correct_answers"]["ansValue3"] = float(a[2])
        data["params"]["units"] = "{\\rm\\ m/s^2}"

    data["params"]["quantity"] = quantity
    data["params"]["expr"] = expr
    data["params"]["omega"] = float(omega[2])
    data["params"]["r_vec"] = cartesianVector(r)
    data["params"]["r"] = pl.to_json(r)

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
