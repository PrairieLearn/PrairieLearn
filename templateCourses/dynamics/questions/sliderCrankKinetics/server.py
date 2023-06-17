import random

import numpy as np
import prairielearn as pl
from pl_draw import *
from pl_geom import *
from pl_random import *
from pl_template import *


def generate(data):
    rOP = np.array(
        random.choice(
            [[1, 1, 0], [0, 2, 0], [-1, 1, 0], [1, -1, 0], [0, -2, 0], [-1, -1, 0]]
        )
    )
    rPQ = np.array([random.choice([-1, 1]) * 8, random.randint(-2, 2), 0])

    ei = np.array([1, 0, 0])
    ej = np.array([0, 1, 0])
    eQT = random.choice([ei, ej])
    eQN = perp(eQT)
    if eQT[0] == 0:
        rOP = perp(rOP)
        rPQ = perp(rPQ)

    rOPPerp = perp(rOP)
    rPQPerp = perp(rPQ)
    rCP = -0.5 * rPQ
    rCQ = 0.5 * rPQ
    rCPPerp = perp(rCP)
    rCQPerp = perp(rCQ)

    if np.dot(rOP, eQT) == 0:
        omega2 = 0
        omega1 = randIntNonZero(-3, 3)
        alpha2 = (
            omega1**2 * np.dot(rOP, eQN) + omega2**2 * np.dot(rPQ, eQN)
        ) / np.dot(rPQ, eQT)
        alpha1 = randIntNonZero(-2, 2)
    else:
        omega2 = randIntNonZero(-2, 2)
        omega1 = -omega2 * np.dot(rPQ, eQT) / np.dot(rOP, eQT)
        alpha2 = randIntNonZero(-2, 2)
        alpha1 = (
            omega1**2 * np.dot(rOP, eQN)
            + omega2**2 * np.dot(rPQ, eQN)
            - alpha2 * np.dot(rPQ, eQT)
        ) / np.dot(rOP, eQT)

    vP = omega1 * rOPPerp
    vQ = vP + omega2 * rPQPerp

    aP = alpha1 * rOPPerp - omega1**2 * rOP
    aQ = aP + alpha2 * rPQPerp - omega2**2 * rPQ
    aC = aP + alpha2 * -rCPPerp - omega2**2 * -rCP

    m1 = 2 * random.randint(1, 2)
    m2 = 3 * random.randint(1, 2)

    I1 = 0.5 * m1 * np.dot(rOP, rOP)
    I2 = 1 / 12 * m2 * np.dot(rPQ, rPQ)

    # Now for pl-drawing. This will be done first, since the variables will become SymPy matrices later on
    O = np.zeros(3)
    rP = rOP
    rQ = rOP + rPQ
    rC = (rP + rQ) / 2
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

    Px = Ox + 30 * rOP[0]
    Py = Oy - 30 * rOP[1]

    Qx = 210 + 30 * (rQ[0] - C[0])
    Qy = 210 - 30 * (rQ[1] - C[1])

    Cx = 210 + 30 * (rC[0] - C[0])
    Cy = 210 - 30 * (rC[1] - C[1])

    # Slot will be lines
    [slot_angle, slot_PL_angle] = angleOf(eQT)
    [slot_norm_angle, slot_norm_PL_angle] = angleOf(eQN)

    l = 13
    w = 30

    slot1x1 = Qx + l * np.cos(slot_norm_angle) - w / 2 * np.cos(slot_angle)
    slot1y1 = Qy - l * np.sin(slot_norm_angle) + w / 2 * np.sin(slot_angle)

    slot2x1 = Qx - l / 2 * np.cos(slot_norm_angle) - w / 2 * np.cos(slot_angle)
    slot2y1 = Qy + l * np.sin(slot_norm_angle) + w / 2 * np.sin(slot_angle)

    drawGround1 = ground(np.array([slot1x1, slot1y1]), -eQN, 110)
    drawGround2 = ground(np.array([slot2x1, slot2y1]), eQN, 110)

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

    B2x1 = 210 + 20 * (rQ[0] / 2 - C[0]) - 20
    B2y1 = 210 - 20 * (rQ[1] / 2 - C[1]) - 20

    data["params"]["Ox"] = Ox
    data["params"]["Oy"] = Oy
    data["params"]["Px"] = Px
    data["params"]["Py"] = Py
    data["params"]["Qx"] = Qx
    data["params"]["Qy"] = Qy
    data["params"]["Cx"] = Cx
    data["params"]["Cy"] = Cy
    data["params"]["r"] = 30 * r
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

    data["params"]["m1"] = float(m1)
    data["params"]["m2"] = float(m2)
    data["params"]["I1"] = I1
    data["params"]["I2"] = I2
    data["params"]["rOP_vec"] = cartesianVector(rOP)
    data["params"]["rOP"] = pl.to_json(rOP)
    data["params"]["rPQ_vec"] = cartesianVector(rPQ)
    data["params"]["rPQ"] = pl.to_json(rPQ)
    data["params"]["omega1_vec"] = cartesianVector(np.array([0, 0, omega1]).astype(int))
    data["params"]["omega1"] = pl.to_json(np.array([0, 0, omega1]))
    data["params"]["omega2_vec"] = cartesianVector(np.array([0, 0, omega2]).astype(int))
    data["params"]["omega2"] = pl.to_json(np.array([0, 0, omega2]))
    data["params"]["vP_vec"] = cartesianVector(vP.astype(int))
    data["params"]["vP"] = pl.to_json(vP)
    data["params"]["vQ_vec"] = cartesianVector(vQ.astype(int))
    data["params"]["vQ"] = pl.to_json(vQ)

    # Will use SymPy to solve for Fp, Fq, M
    rOP = Matrix(rOP.tolist())
    rPQ = Matrix(rPQ.tolist())
    rCP = Matrix(rCP.tolist())
    rCQ = Matrix(rCQ.tolist())
    aP = Matrix(aP.tolist())
    aQ = Matrix(aQ.tolist())
    aC = Matrix(aC.tolist())
    omega1 = Matrix([0, 0, omega1])
    omega2 = Matrix([0, 0, omega2])
    alpha1 = Matrix([0, 0, alpha1])
    alpha2 = Matrix([0, 0, alpha2])

    Fpx, Fpy, Mz = symbols("Fpx, Fpy, Mz")
    Fp = Matrix([Fpx, Fpy, 0])
    M = Matrix([0, 0, Mz])
    unknown_list = [Fpx, Fpy, Mz]

    if eQT[1] == 0:
        Fqy = symbols("Fqy")
        unknown_list.append(Fqy)
        Fq = Matrix([0, Fqy, 0])
    else:
        Fqx = symbols("Fqx")
        unknown_list.append(Fqx)
        Fq = Matrix([Fqx, 0, 0])

    eq1 = Eq(rOP.cross(-Fp) + M, I1 * alpha1)
    eq2 = Eq(Fp + Fq, m2 * aC)
    eq3 = Eq(rCQ.cross(Fq) + rCP.cross(Fp), I2 * alpha2)

    soln = solve((eq1, eq2, eq3), tuple(unknown_list))

    Fp = Fp.subs([(Fpx, soln[Fpx]), (Fpy, soln[Fpy])])
    M = M.subs(Mz, soln[Mz])
    Fq = Fq.subs(unknown_list[-1], soln[unknown_list[-1]])

    givenNum = random.choice([2, 3, 3, 4])
    givenPotList = [
        "\\vec{\\alpha}_1",
        "\\vec{\\alpha}_2",
        "\\vec{a}_P",
        "\\vec{a}_Q",
        "\\vec{F}_P",
        "\\vec{F}_Q",
        "\\vec{M}",
    ]

    vectorList = givenPotList[2:6]
    UnitsDictionary = {
        "\\vec{\\alpha}_1": "{\\rm\\ rad/s^2}",
        "\\vec{\\alpha}_2": "{\\rm\\ rad/s^2}",
        "\\vec{a}_P": "{\\rm\\ m/s^2}",
        "\\vec{a}_Q": "{\\rm\\ m/s^2}",
        "\\vec{M}": "{\\rm\\ N\\ m}",
        "\\vec{F}_P": "{\\rm\\ N}",
        "\\vec{F}_Q": "{\\rm\\ N}",
    }

    alpha1 = (
        np.array(alpha1)
        .astype(np.float64)
        .reshape(
            3,
        )
    )
    alpha2 = (
        np.array(alpha2)
        .astype(np.float64)
        .reshape(
            3,
        )
    )
    aP = (
        np.array(aP)
        .astype(np.float64)
        .reshape(
            3,
        )
    )
    aQ = (
        np.array(aQ)
        .astype(np.float64)
        .reshape(
            3,
        )
    )
    M = (
        np.array(M)
        .astype(np.float64)
        .reshape(
            3,
        )
    )
    Fp = (
        np.array(Fp)
        .astype(np.float64)
        .reshape(
            3,
        )
    )
    Fq = (
        np.array(Fq)
        .astype(np.float64)
        .reshape(
            3,
        )
    )

    valsDictionary = {
        "\\vec{\\alpha}_1": alpha1,
        "\\vec{\\alpha}_2": alpha2,
        "\\vec{a}_P": aP,
        "\\vec{a}_Q": aQ,
        "\\vec{M}": M,
        "\\vec{F}_P": Fp,
        "\\vec{F}_Q": Fq,
    }

    givenList = NChoice(givenNum, givenPotList)
    ansVar = random.choice(givenPotList)

    givenPotList = [
        "\\vec{\\alpha}_1",
        "\\vec{\\alpha}_2",
        "\\vec{a}_P",
        "\\vec{a}_Q",
        "\\vec{F}_P",
        "\\vec{F}_Q",
        "\\vec{M}",
    ]

    plVars = []
    removeChars = "\\vec{}_"
    for var in givenPotList:
        for char in removeChars:
            var = var.replace(char, "")
        plVars.append(var)

    pl_var_output_list = []
    for i in range(len(givenPotList)):
        for j in range(len(givenList)):
            if givenList[j] == givenPotList[i]:
                givenVar = f"givenVar{i+1}"
                data["params"][givenVar] = plVars[i]
                data["params"][plVars[i]] = pl.to_json(valsDictionary[givenList[j]])
                var_output = (
                    f'<variable params-name="{plVars[i]}">{plVars[i]}</variable>'
                )
                pl_var_output_list.append(var_output)

    pl_var_output_string = "".join(pl_var_output_list)

    data["params"]["pl_var_output_string"] = pl_var_output_string

    data["params"]["ansVar"] = ansVar
    data["params"]["ansUnits"] = UnitsDictionary[ansVar]

    if ansVar not in vectorList:
        data["correct_answers"]["ans"] = valsDictionary[ansVar][2]
        ansCode = """<pl-number-input answers_name="ans" comparison="relabs" rtol="1e-2" atol="1e-5" display="inline" size="15" show-placeholder="false"></pl-number-input> $\\hat{k}$"""
    else:
        data["correct_answers"]["ans1"] = valsDictionary[ansVar][0]
        data["correct_answers"]["ans2"] = valsDictionary[ansVar][1]
        ansCode = """<pl-number-input answers_name="ans1" comparison="relabs" rtol="1e-2" atol="1e-5" display="inline" size="15" show-placeholder="false"></pl-number-input> $\\hat{\\imath} + $
					<pl-number-input answers_name="ans2" comparison="relabs" rtol="1e-2" atol="1e-5" display="inline" size="15" show-placeholder="false"></pl-number-input> $\\hat{\\jmath}$"""

    for i in range(len(givenPotList)):
        if givenPotList[i] in givenList:
            givenPotList[i] = (
                givenPotList[i]
                + " &amp;= "
                + f"{cartesianVector(valsDictionary[givenPotList[i]])}"
                + UnitsDictionary[givenPotList[i]]
            )
        else:
            givenPotList[i] = "&amp;"

        if i % 2 != 0:
            givenPotList[i] = givenPotList[i] + "\\\\"
        else:
            givenPotList[i] = givenPotList[i] + "&amp;"

    givenString = "".join(givenPotList)

    data["params"]["ansCode"] = ansCode
    data["params"]["givenString"] = givenString
    return data
