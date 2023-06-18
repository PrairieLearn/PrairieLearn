import random
import numpy as np
import prairielearn as pl

def generate(data):

    a = np.zeros(3)
    cDotA = 0
    cDotB = 0

    while (
        abs(abs(float(a[0])) - abs(float(a[1]))) < 1e-6
        or abs(float(a[0])) < 1e-6
        or abs(float(a[1])) < 1e-6
        or np.linalg.norm(a) < 1.5
        or abs(abs(cDotA) - abs(cDotB)) < 1e-6
    ):
        a = randIntNonZeroArray(2, -4, 4)
        cDotA = randIntNonZero(-10, 10)
        cDotB = randIntNonZero(-10, 10)

    b = perp(a) * random.choice([-1, 1])
    ax = float(a[0])
    ay = float(a[1])

    bx = float(b[0])
    by = float(b[1])

    A = np.array([[ax, ay], [bx, by]])
    g = np.array([[cDotA], [cDotB]])

    c = np.linalg.solve(A, g)

    O = np.zeros(3)

    [bottomLeft, bottomRight, topLeft, topRight, center, extent] = boundingBox2D(
        [O, a, b]
    )

    C = center

    Ox = 250 + 30 * (O[0] - C[0])
    Oy = 155 - 30 * (O[1] - C[1])

    O = np.array([Ox, Oy, 0])

    data["params"]["a_vec"] = cartesianVector(a)
    data["params"]["a"] = pl.to_json(a)
    [aAngle, aPLAngle] = angleOf(a)
    [bAngle, bPLAngle] = angleOf(b)

    data["params"]["a_angle"] = aPLAngle
    data["params"]["b_angle"] = bPLAngle
    data["params"]["cDotA"] = cDotA
    data["params"]["cDotB"] = cDotB

    amag = np.linalg.norm(a)
    data["params"]["width"] = amag * 35
    data["params"]["Ox"] = Ox
    data["params"]["Oy"] = Oy
    data["params"]["drawRightAngle"] = rightAngle(O, a, b)
    data["correct_answers"]["cx"] = float(c[0])
    data["correct_answers"]["cy"] = float(c[1])

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

def rightAngle(O, v1, v2):
    """
    O: origin of vectors v1, v2, in PL coordinates
    v1: first vector of size (3,)
    v2: second vector of size (3,)
    returns pl-drawing code to draw the right angle between them
    """
    [v1_angle, v1PLangle] = angleOf(v1)
    [v2_angle, v2PLangle] = angleOf(v2)

    startLine1x = O[0] + 11 * np.cos(v1_angle)
    startLine2x = O[0] + 11 * np.cos(v2_angle)
    startLine1y = O[1] - 11 * np.sin(v1_angle)
    startLine2y = O[1] - 11 * np.sin(v2_angle)

    drawRightAngle = f'<pl-line x1={startLine1x} y1={startLine1y} angle={v2PLangle} width="11" stroke-width="1"></pl-line>\n\
					<pl-line x1={startLine2x} y1={startLine2y} angle={v1PLangle} width="11" stroke-width="1"></pl-line>'

    return drawRightAngle

