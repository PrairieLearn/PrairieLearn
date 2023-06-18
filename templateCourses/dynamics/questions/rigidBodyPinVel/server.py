import random
import numpy as np
import prairielearn as pl


def generate(data):
    angleDeg = random.choice([0, 45, 90, 135])
    angle = np.radians(angleDeg)

    if angleDeg == 0:
        slotSentence = "horizontal slot"
    elif angleDeg == 45 or angleDeg == 135:
        slotSentence = "slot at an angle $45^\\circ$ to the horizontal"
    else:
        slotSentence = "vertical slot"

    findVar = random.choice(["\\omega", "v_Q"])

    if findVar == "\\omega":
        findSentence = "the magnitude of the angular velocity of the body"
        findUnits = "rad/s"
    else:
        findSentence = "the magnitude of the velocity of point $Q$"
        findUnits = "m/s"

    extent = np.array([6, 9, 0])
    rPQ = np.array([1, -1, 0])
    eQ = np.array([1, 1, 0])
    vP = np.array([1, 1, 0])
    eQPerp = rPQ

    while (
        extent[1] > 5
        or extent[0] > 8
        or abs(np.dot(rPQ, eQ)) < 0.01
        or abs(np.dot(vP, rPQ)) < 0.01
        or abs(np.dot(vP, eQPerp)) < 0.01
    ):
        r = random.uniform(2, 4)
        theta = (
            angle
            + random.choice([0, np.pi])
            + random.uniform(-1 / 3 * np.pi, 1 / 3 * np.pi)
        )
        rPQ = np.round(
            np.array([r * np.cos(theta), r * np.sin(theta), 0])
            * random.choice([-1, 1]),
            0,
        )

        vP = randIntNonZeroArray(2, -3, 3)
        eQ = vector2DAtAngle(angle)
        eQPerp = perp(eQ)

        O = np.zeros(3)
        C = -0.5 * rPQ
        rotation_angle = random.randint(1, 5) / 6 * np.pi
        rectPointVec = (
            np.array(
                [
                    [np.cos(rotation_angle), -np.sin(rotation_angle), 0],
                    [np.sin(rotation_angle), np.cos(rotation_angle), 0],
                    [0, 0, 0],
                ]
            )
            @ C
        )
        rectPoint1 = C + rectPointVec
        rectPoint2 = C - rectPointVec
        rP = -rPQ

        [bottomLeft, bottomRight, topLeft, topRight, center, extent] = boundingBox2D(
            [O, rP, rP + vP, rectPoint1, rectPoint2]
        )

    rPQPerp = perp(rPQ)
    vQMag = abs(np.dot(vP, rPQ) / np.dot(eQ, rPQ))
    omega = abs(np.dot(vP, eQPerp) / np.dot(rPQPerp, eQPerp))

    if findVar == "\\omega":
        ansValue = omega
    else:
        ansValue = vQMag
    C = center

    offset_width = 45

    # Creating the slots in pl-drawing

    slot1p1 = eQPerp * 0.1 + 15 * eQ
    slot1p2 = eQPerp * 0.1 - 15 * eQ

    slot2p1 = -eQPerp * 0.1 + 15 * eQ
    slot2p2 = -eQPerp * 0.1 - 15 * eQ

    slot1x1 = 250 + offset_width * (slot1p1[0] - C[0])
    slot1y1 = 155 - offset_width * (slot1p1[1] - C[1])
    slot1x2 = 250 + offset_width * (slot1p2[0] - C[0])
    slot1y2 = 155 - offset_width * (slot1p2[1] - C[1])

    slot2x1 = 250 + offset_width * (slot2p1[0] - C[0])
    slot2y1 = 155 - offset_width * (slot2p1[1] - C[1])
    slot2x2 = 250 + offset_width * (slot2p2[0] - C[0])
    slot2y2 = 155 - offset_width * (slot2p2[1] - C[1])

    data["params"]["slot1x1"] = slot1x1
    data["params"]["slot1x2"] = slot1x2
    data["params"]["slot1y1"] = slot1y1
    data["params"]["slot1y2"] = slot1y2
    data["params"]["slot2x1"] = slot2x1
    data["params"]["slot2x2"] = slot2x2
    data["params"]["slot2y1"] = slot2y1
    data["params"]["slot2y2"] = slot2y2

    # Creating the polygon
    data["params"]["px1"] = 250 + offset_width * (-C[0])
    data["params"]["px2"] = 250 + offset_width * (rectPoint1[0] - C[0])
    data["params"]["px3"] = 250 + offset_width * (rP[0] - C[0])
    data["params"]["px4"] = 250 + offset_width * (rectPoint2[0] - C[0])

    data["params"]["py1"] = 155 - offset_width * (-C[1])
    data["params"]["py2"] = 155 - offset_width * (rectPoint1[1] - C[1])
    data["params"]["py3"] = 155 - offset_width * (rP[1] - C[1])
    data["params"]["py4"] = 155 - offset_width * (rectPoint2[1] - C[1])

    [vPangle, vPPLangle] = angleOf(vP)
    data["params"]["vP_angle"] = vPPLangle
    data["params"]["vP_width"] = 30 * np.linalg.norm(vP)

    data["params"]["rPQ_vec"] = cartesianVector(rPQ.astype(int))
    data["params"]["vP_vec"] = cartesianVector(vP)
    data["params"]["slotSentence"] = slotSentence
    data["params"]["findSentence"] = findSentence
    data["params"]["findUnits"] = findUnits
    data["params"]["findVar"] = findVar
    data["params"]["theta"] = angleDeg
    data["params"]["rPQ"] = pl.to_json(rPQ)
    data["params"]["vP"] = pl.to_json(vP)

    data["correct_answers"]["ansValue"] = ansValue

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

def vector2DAtAngle(x):
    """x: angle measured from the x-axis, in radians
    returns unit vector of size (3,)"""
    return np.array([np.cos(x), np.sin(x), 0])

def perp(v):
    """v: numpy array of size (n,)
       n: size of the array
    returns the counterclockwise orthogonal vector to v
    """
    return np.array([-v[1], v[0], 0])

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