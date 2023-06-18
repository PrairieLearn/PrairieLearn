import random
import numpy as np
import prairielearn as pl


def generate(data):
    a = randIntNonZeroArray(2, -4, 4)
    while (
        (abs(abs(a[0]) - abs(a[1]))) < 1e-6
        or abs(a[0]) < 1e-6
        or abs(a[1]) < 1e-6
        or np.linalg.norm(a) < 1.5
    ):
        a = randIntNonZeroArray(2, -4, 4)

    thetaCoeff = [random.randint(2, 7), 9]
    thetaSign = random.choice([-1, 1])
    bLength = random.randint(2, 4)

    theta = thetaSign * thetaCoeff[0] / thetaCoeff[1] * np.pi
    [aAngle, aPLangle] = angleOf(a)
    bAngle = aAngle + theta
    b = vector2DAtAngle(bAngle) * bLength

    data["params"]["a_vec"] = cartesianVector(a)
    data["params"]["a"] = pl.to_json(a)
    data["params"]["a_angle"] = aPLangle
    data["params"]["a_width"] = 30 * np.linalg.norm(a)
    data["params"]["bLength"] = bLength
    data["params"]["thetaCoeff1"] = thetaCoeff[0]
    data["params"]["thetaCoeff2"] = thetaCoeff[1]
    data["params"]["theta"] = thetaCoeff[0] / thetaCoeff[1] * np.pi

    [bAngle, bPLangle] = angleOf(b)

    data["params"]["b_angle"] = bPLangle
    data["params"]["b_width"] = 30 * bLength

    crossprod = np.cross(a, b)[2]
    if crossprod > 0:
        angleStart = bPLangle
        angleEnd = aPLangle
    else:
        angleStart = aPLangle
        angleEnd = bPLangle

    if angleEnd < angleStart:
        angleEnd -= 360

    data["params"]["angleStart"] = angleStart
    data["params"]["angleEnd"] = angleEnd

    O = np.zeros(3)

    [bottomLeft, bottomRight, topLeft, topRight, center, extent] = boundingBox2D(
        [O, a, b]
    )

    C = center

    Ox = 255 + 30 * (O[0] - C[0])
    Oy = 155 - 30 * (O[1] - C[1])

    O = np.array([Ox, Oy, 0])

    data["params"]["Ox"] = Ox
    data["params"]["Oy"] = Oy

    [sum_angle, sum_PL_angle] = angleOf(a + b / np.linalg.norm(b) * np.linalg.norm(a))

    offsetx = 12 * np.cos(sum_angle)
    offsety = -12 * np.sin(sum_angle)

    data["params"]["offsetx"] = offsetx
    data["params"]["offsety"] = offsety

    data["correct_answers"]["bx"] = b[0]
    data["correct_answers"]["by"] = b[1]

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

