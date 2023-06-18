import random
import numpy as np
import prairielearn as pl

def generate(data):
    thetaDeg = random.choice([45, 135, -45, -135])
    theta = np.radians(thetaDeg)
    u = vector2DAtAngle(theta)
    v = perp(u)

    [uAngle, uPLAngle] = angleOf(u)
    [vAngle, vPLAngle] = angleOf(v)

    rOQ = np.array(
        [random.choice([-1, 1]) * random.randint(3, 5), randIntNonZero(-2, 2), 0]
    )
    rOP = np.array(
        [randIntNonZero(-2, 2), random.choice([-1, 1]) * random.randint(2, 3), 0]
    )
    rQP = rOP - rOQ

    rOPuv = np.array([np.dot(rOP, u), np.dot(rOP, v), 0])

    O = np.zeros(3)
    i = np.array([1, 0, 0])
    j = np.array([0, 1, 0])

    [bottomLeft, bottomRight, topLeft, topRight, center, extent] = boundingBox2D(
        [O, rOQ, i, j, rOQ + u, rOQ + v, rOP]
    )

    C = center

    Ox = 250 + 40 * (O[0] - C[0])
    Oy = 155 - 40 * (O[1] - C[1])
    Px = 250 + 40 * (rOP[0] - C[0])
    Py = 155 - 40 * (rOP[1] - C[1])
    Qx = 250 + 40 * (rOQ[0] - C[0])
    Qy = 155 - 40 * (rOQ[1] - C[1])

    theta = thetaDeg

    if theta > 0:
        Qoffsetx = 5
        Qoffsety = 5
    else:
        Qoffsetx = -20
        Qoffsety = -20

    if theta > 0:
        startAngle = uPLAngle
        endAngle = 0
        offsetx = 5
        offsety = -5
        drawStartArrow = "true"
        drawEndArrow = "false"
    else:
        startAngle = 0
        endAngle = uPLAngle
        offsetx = 10
        offsety = 10
        drawStartArrow = "false"
        drawEndArrow = "true"

    data["params"]["u_theta"] = uPLAngle
    data["params"]["v_theta"] = vPLAngle
    data["params"]["theta"] = abs(theta)

    data["params"]["Ox"] = Ox
    data["params"]["Oy"] = Oy
    data["params"]["Px"] = Px
    data["params"]["Py"] = Py
    data["params"]["Qx"] = Qx
    data["params"]["Qy"] = Qy

    data["params"]["rOQ_vec"] = cartesianVector(rOQ)
    data["params"]["rQP_vec"] = cartesianVector(rQP)
    data["params"]["rOQ"] = pl.to_json(rOQ)
    data["params"]["rQP"] = pl.to_json(rQP)

    data["params"]["Qoffsetx"] = Qoffsetx
    data["params"]["Qoffsety"] = Qoffsety

    data["params"]["startAngle"] = startAngle
    data["params"]["endAngle"] = endAngle
    data["params"]["offsetx"] = offsetx
    data["params"]["offsety"] = offsety
    data["params"]["drawStartArrow"] = drawStartArrow
    data["params"]["drawEndArrow"] = drawEndArrow

    data["correct_answers"]["rOPu"] = rOPuv[0]
    data["correct_answers"]["rOPv"] = rOPuv[1]
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

def perp(v):
    """v: numpy array of size (n,)
       n: size of the array
    returns the counterclockwise orthogonal vector to v
    """
    return np.array([-v[1], v[0], 0])

def angleOf(v):
    """v: vector of size (n,)
    returns the true angle of the vector with respect to the x-axis, in radians
    returns the adjusted angle for pl-drawing, in degrees"""
    trueAngle = np.arctan2(v[1], v[0])
    plAngle = 0

    if trueAngle < 0:
        plAngle = abs(trueAngle)
    else:
        plAngle = -trueAngle

    return trueAngle, np.degrees(plAngle)

def vector2DAtAngle(x):
    """x: angle measured from the x-axis, in radians
    returns unit vector of size (3,)"""
    return np.array([np.cos(x), np.sin(x), 0])


def boundingBox2D(points):
    xMin = points[0][0]
    xMax = points[0][0]
    yMin = points[0][1]
    yMax = points[0][1]
    for i in range(1, len(points)):
        xMin = min(xMin, points[i][0])
        xMax = max(xMax, points[i][0])
        yMin = min(yMin, points[i][1])
        yMax = max(yMax, points[i][1])

    bottomLeft = np.array([xMin, yMin, 0])
    bottomRight = np.array([xMax, yMin, 0])
    topLeft = np.array([xMin, yMax, 0])
    topRight = np.array([xMax, yMax, 0])
    center = np.array([(xMin + xMax) / 2, (yMin + yMax) / 2, 0])
    extent = np.array([xMax - xMin, yMax - yMin])

    return bottomLeft, bottomRight, topLeft, topRight, center, extent
