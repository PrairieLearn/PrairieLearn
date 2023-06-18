import random

import numpy as np
import prairielearn as pl


def generate(data):
    rOP = np.array(random.choice([[1, 3], [1, 2]]))
    xSign = random.choice([-1, 1])
    rOP = np.array([rOP[0] * xSign, rOP[1] * random.choice([-1, 1]), 0])

    if random.choice([True, False]):
        rPQ = np.array([8 * xSign, random.randint(-4, 4), 0])
    else:
        rPQ = np.array([-xSign * 12, random.randint(-4, 4), 0])

    ei = np.array([1, 0, 0])
    ej = np.array([0, 1, 0])

    eQT = random.choice([ei, ej])
    eQN = perp(eQT)

    if eQT[0] == 0:
        rOP = perp(rOP)
        rPQ = perp(rPQ)

    rOPPerp = perp(rOP)
    rPQPerp = perp(rPQ)
    omega2 = randIntNonZero(-3, 3)
    omega1 = int(-omega2 * np.dot(rPQ, eQT) / np.dot(rOP, eQT))
    vP = omega1 * rOPPerp
    vQ = vP + omega2 * rPQPerp

    alpha2 = randIntNonZero(-3, 3)
    alpha1 = int(
        (
            -alpha2 * np.dot(rPQ, eQT)
            + omega1**2 * np.dot(rOP, eQN)
            + omega2**2 * np.dot(rPQ, eQN)
        )
        / np.dot(rOP, eQT)
    )

    aP = alpha1 * rOPPerp - omega1**2 * rOP
    aQ = aP + alpha2 * rPQPerp - omega2**2 * rPQ

    vars_given_list = [
        "\\vec{a}_Q",
        "\\vec{\\alpha}_1",
        "\\vec{\\alpha}_2",
        "\\vec{a}_P",
    ]
    units_given_list = ["m/s^2", "rad/s^2", "rad/s^2", "m/s^2"]

    givenVar = random.choice(vars_given_list)
    givenUnits = units_given_list[vars_given_list.index(givenVar)]

    vars_given_list.remove(givenVar)

    findVar = random.choice(vars_given_list)

    if givenVar == "\\vec{a}_Q":
        # For pl-variable-output
        givenVals_pl = pl.to_json(aQ)
        # For vector rendering
        givenVals_vec = cartesianVector(aQ)
        data["params"]["aQ"] = givenVals_pl
        data["params"]["givenName"] = "aQ"

    elif givenVar == "\\vec{\\alpha}_1":
        givenVals_pl = pl.to_json(np.array([0, 0, alpha1]))
        givenVals_vec = cartesianVector(np.array([0, 0, alpha1]))
        data["params"]["alpha1"] = givenVals_pl
        data["params"]["givenName"] = "alpha1"

    elif givenVar == "\\vec{\\alpha}_2":
        givenVals_pl = pl.to_json(np.array([0, 0, alpha2]))
        givenVals_vec = cartesianVector(np.array([0, 0, alpha2]))
        data["params"]["alpha2"] = givenVals_pl
        data["params"]["givenName"] = "alpha2"

    else:
        givenVals_pl = pl.to_json(aP)
        givenVals_vec = cartesianVector(aP)
        data["params"]["aP"] = givenVals_pl
        data["params"]["givenName"] = "aP"

    # Now, since alpha1 and alpha2 are singular number inputs, and aP and aQ are vectors, we need to create pl-number-input here
    if findVar == "\\vec{\\alpha}_1":
        data["correct_answers"]["ansScalar"] = alpha1
        findUnits = "rad/s^2"
        data["params"][
            "submitAnswer"
        ] = """<pl-number-input answers_name="ansScalar" comparison="relabs" rtol="1e-2" atol="1e-5" size="15" show-placeholder="false"></pl-number-input>$\\hat{k}$"""

    elif findVar == "\\vec{\\alpha}_2":
        data["correct_answers"]["ansScalar"] = alpha2
        findUnits = "rad/s^2"
        data["params"][
            "submitAnswer"
        ] = """<pl-number-input answers_name="ansScalar" comparison="relabs" rtol="1e-2" atol="1e-5" size="15" show-placeholder="false"></pl-number-input>$\\hat{k}$"""

    elif findVar == "\\vec{a}_P":
        data["correct_answers"]["ansValue1"] = float(aP[0])
        data["correct_answers"]["ansValue2"] = float(aP[1])
        findUnits = "m/s^2"
        data["params"][
            "submitAnswer"
        ] = """<pl-number-input answers_name="ansValue1" comparison="relabs" rtol="1e-2" atol="1e-5" display="inline" size="15" show-placeholder="false"></pl-number-input> $\\hat{\\imath} + $\
		<pl-number-input answers_name="ansValue2" comparison="relabs" rtol="1e-2" atol="1e-5" display="inline" size="15" show-placeholder="false"></pl-number-input> $\\hat{\\jmath}$"""

    else:
        data["correct_answers"]["ansValue1"] = float(aQ[0])
        data["correct_answers"]["ansValue2"] = float(aQ[1])
        findUnits = "m/s^2"
        data["params"][
            "submitAnswer"
        ] = """<pl-number-input answers_name="ansValue1" comparison="relabs" rtol="1e-2" atol="1e-5" display="inline" size="15" show-placeholder="false"></pl-number-input> $\\hat{\\imath} + $\
		<pl-number-input answers_name="ansValue2" comparison="relabs" rtol="1e-2" atol="1e-5" display="inline" size="15" show-placeholder="false"></pl-number-input> $\\hat{\\jmath}$"""

    data["params"]["rOP_vec"] = cartesianVector(rOP)
    data["params"]["rPQ_vec"] = cartesianVector(rPQ)
    data["params"]["omega1_vec"] = cartesianVector(np.array([0, 0, omega1]))
    data["params"]["omega2_vec"] = cartesianVector(np.array([0, 0, omega2]))
    data["params"]["vP_vec"] = cartesianVector(vP)
    data["params"]["vQ_vec"] = cartesianVector(vQ)
    data["params"]["rOP"] = pl.to_json(rOP)
    data["params"]["rPQ"] = pl.to_json(rPQ)
    data["params"]["omega1"] = pl.to_json(np.array([0, 0, omega1]))
    data["params"]["omega2"] = pl.to_json(np.array([0, 0, omega2]))
    data["params"]["vP"] = pl.to_json(vP)
    data["params"]["vQ"] = pl.to_json(vQ)
    data["params"]["givenVals_vec"] = givenVals_vec
    data["params"]["givenVals"] = givenVals_pl
    data["params"]["givenUnits"] = givenUnits
    data["params"]["givenVar"] = givenVar
    data["params"]["findVar"] = findVar
    data["params"]["findUnits"] = findUnits

    # Now for pl-drawing
    O = np.zeros(3)
    rP = rOP
    rQ = rOP + rPQ
    r = np.linalg.norm(rOP)

    l = 2
    w = 0.5
    g00 = rQ + l * eQT + w * eQN
    g01 = rQ + l * eQT - w * eQN
    g10 = rQ - l * eQT + w * eQN
    g11 = rQ - l * eQT - w * eQN

    point1 = O + np.array([r, 0, 0])
    point2 = O + np.array([-r, 0, 0])
    point3 = O + np.array([0, r, 0])
    point4 = O + np.array([0, -r, 0])

    [bottomLeft, bottomRight, topLeft, topRight, center, extent] = boundingBox2D(
        [point1, point2, point3, point4, g00, g01, g10, g11]
    )

    C = center

    Ox = 210 + 30 * (O[0] - C[0])
    Oy = 210 - 30 * (O[1] - C[1])

    Px = Ox + 18 * rOP[0]
    Py = Oy - 18 * rOP[1]

    Qx = 210 + 20 * (rQ[0] - C[0])
    Qy = 210 - 20 * (rQ[1] - C[1])

    # Slot will be lines
    [slot_angle, slot_PL_angle] = angleOf(eQT)
    [slot_norm_angle, slot_norm_PL_angle] = angleOf(eQN)

    l = 13
    w = 30

    slot1x1 = Qx + l * np.cos(slot_norm_angle) - w / 2 * np.cos(slot_angle)
    slot1y1 = Qy - l * np.sin(slot_norm_angle) + w / 2 * np.sin(slot_angle)

    slot2x1 = Qx - l / 2 * np.cos(slot_norm_angle) - w / 2 * np.cos(slot_angle)
    slot2y1 = Qy + l * np.sin(slot_norm_angle) + w / 2 * np.sin(slot_angle)

    drawGround1 = ground(np.array([slot1x1, slot1y1]), -eQN, 90)
    drawGround2 = ground(np.array([slot2x1, slot2y1]), eQN, 90)

    # Q label offset, must be inside the slot

    # if slot is horizontal, and is on the right of the figure
    if slot_angle == 0 and np.sign(rPQ[0]) == 1:
        Qoffsetx = 10
        Qoffsety = -10
    # if slot is horizontal, and is on the left of the figure
    elif slot_angle == 0 and np.sign(rPQ[0]) == -1:
        Qoffsetx = -25
        Qoffsety = -10

    # if slot is vertical, and is on the top of the figure
    elif slot_angle == np.pi / 2 and np.sign(rPQ[1]) == 1:
        Qoffsetx = -10
        Qoffsety = -25

    # if slot is vertical, and is on the bottom of the figure
    elif slot_angle == np.pi / 2 and np.sign(rPQ[1]) == -1:
        Qoffsetx = -10
        Qoffsety = 10

    # B1 and B2 labels
    B1x1 = Ox - 18 * rOP[0] - 2 * r
    B1y1 = Oy + 18 * rOP[1] + 2 * r

    B2x1 = 210 + 20 * (rQ[0] / 2 - C[0])
    B2y1 = 210 - 20 * (rQ[1] / 2 - C[1])

    data["params"]["Ox"] = Ox
    data["params"]["Oy"] = Oy
    data["params"]["Px"] = Px
    data["params"]["Py"] = Py
    data["params"]["Qx"] = Qx
    data["params"]["Qy"] = Qy
    data["params"]["r"] = 18 * r
    data["params"]["slot_angle"] = slot_PL_angle
    data["params"]["slot1x1"] = slot1x1
    data["params"]["slot1y1"] = slot1y1
    data["params"]["slot2x1"] = slot2x1
    data["params"]["slot2y1"] = slot2y1
    data["params"]["Qoffsetx"] = float(Qoffsetx)
    data["params"]["Qoffsety"] = float(Qoffsety)
    data["params"]["B1x1"] = B1x1
    data["params"]["B1y1"] = B1y1
    data["params"]["B2x1"] = B2x1
    data["params"]["B2y1"] = B2y1
    data["params"]["drawGround1"] = drawGround1
    data["params"]["drawGround2"] = drawGround2
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


def randIntNonZero(a, b):
    """a: lower bound of the range of integers
       b: upper bound of the range of integers
    returns a non-zero integer in the range [a,b]
    """

    x = 0
    while x == 0:
        x = random.randint(a, b)

    return x


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


def ground(P, en, width):
    """
    P: Location of the ground's center, in PL coordinates as a list or np.array
    en: normal vector of the ground
    width: width of the ground
    returns the pl-drawing code to draw the ground
    NOTE: deprecated, still used in several questions. should be replaced with groundAtAngle()
    """

    offsetx = 6
    offsety = 6

    if np.linalg.norm(en) != 0:
        en = en / np.linalg.norm(en)

    [en_angle, en_PL_angle] = angleOf(en)
    [et_angle, et_PL_angle] = angleOf(perp(en))

    linex1 = P[0] - width / 2 * np.cos(et_angle)
    liney1 = P[1] - width / 2 * np.sin(et_angle)

    linex2 = P[0] + width / 2 * np.cos(et_angle)
    liney2 = P[1] + width / 2 * np.sin(et_angle)

    rectx = P[0] - offsetx * np.sin(et_angle)
    recty = P[1] - offsety * np.cos(et_angle)

    drawGround = f'<pl-line x1={linex1} y1={liney1} x2={linex2} y2={liney2}></pl-line>\n<pl-rectangle x1={rectx} y1={recty} width={width} height="10" angle={et_PL_angle} stroke-width="0" color="#DCDCDC"></pl-rectangle>'

    return drawGround
