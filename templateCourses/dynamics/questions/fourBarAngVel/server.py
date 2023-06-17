import random

import numpy as np
import prairielearn as pl
from pl_draw import *
from pl_geom import *
from pl_random import *
from pl_template import *


def generate(data):
    soln = []
    difficulty = "harder"
    while not soln:
        rAB = np.array([random.randint(1, 2), 0, 0])
        rAD = np.array([random.randint(-1, 0), random.randint(1, 2), 0])
        rBC = np.array([random.randint(0, 1), random.randint(1, 2), 0])

        if difficulty == "easier":
            rBC[1] = rAD[1]

            type_of_linkages = random.choice(["symm", "rect", "existing"])

            if type_of_linkages == "symm":
                rBC[0] = -rAD[0]

            if type_of_linkages == "rect":
                rAD[0] = 0
                rBC[0] = 0

        elif difficulty == "harder":
            rBC[1] = 3 - rAD[1]

        rDC = -rAD + rAB + rBC
        omegas = ["\\omega_1", "\\omega_2", "\\omega_3"]
        selectedIndices = NChoice(2, [0, 1, 2])

        if difficulty == "easier":
            if rAD[0] != 0 or rBC[0] != 0:
                selectedIndices = NChoice(2, [0, 1])

        givenIndex = selectedIndices[0]
        findIndex = selectedIndices[1]
        givenValue = randIntNonZero(-3, 3)
        omegas[givenIndex] = givenValue

        vDx, vDy, vCx, vCy, omega = symbols("vDx, vDy, vCx, vCy, omega")
        vD = Matrix([vDx, vDy, 0])
        vC = Matrix([vCx, vCy, 0])
        if findIndex == 0:
            omega1 = Matrix([0, 0, omega])
            omega1_vec = f"\\omega_1 \\hat{{k}}"
            if givenIndex == 1:
                omega2 = Matrix([0, 0, givenValue])
                omega2_vec = cartesianVector(np.array([0, 0, givenValue]))
                omega3_vec = f"\\omega_3 \\hat{{k}}"
                omega3z = symbols("omega3z")
                omega3 = Matrix([0, 0, omega3z])
                solveTuple = (vDx, vDy, vCx, vCy, omega, omega3z)
            else:
                omega3 = Matrix([0, 0, givenValue])
                omega3_vec = cartesianVector(np.array([0, 0, givenValue]))
                omega2_vec = f"\\omega_2 \\hat{{k}}"
                omega2z = symbols("omega2z")
                omega2 = Matrix([0, 0, omega2z])
                solveTuple = (vDx, vDy, vCx, vCy, omega, omega2z)

        elif findIndex == 1:
            omega2 = Matrix([0, 0, omega])
            omega2_vec = f"\\omega_2 \\hat{{k}}"
            if givenIndex == 0:
                omega1 = Matrix([0, 0, givenValue])
                omega1_vec = cartesianVector(np.array([0, 0, givenValue]))
                omega3_vec = f"\\omega_3 \\hat{{k}}"
                omega3z = symbols("omega3z")
                omega3 = Matrix([0, 0, omega3z])
                solveTuple = (vDx, vDy, vCx, vCy, omega, omega3z)
            else:
                omega3 = Matrix([0, 0, givenValue])
                omega3_vec = cartesianVector(np.array([0, 0, givenValue]))
                omega1_vec = f"\\omega_1 \\hat{{k}}"
                omega1z = symbols("omega1z")
                omega1 = Matrix([0, 0, omega1z])
                solveTuple = (vDx, vDy, vCx, vCy, omega, omega1z)

        else:
            omega3 = Matrix([0, 0, omega])
            omega3_vec = f"\\omega_3 \\hat{{k}}"
            if givenIndex == 0:
                omega1 = Matrix([0, 0, givenValue])
                omega1_vec = cartesianVector(np.array([0, 0, givenValue]))
                omega2_vec = f"\\omega_2 \\hat{{k}}"
                omega2z = symbols("omega2z")
                omega2 = Matrix([0, 0, omega2z])
                solveTuple = (vDx, vDy, vCx, vCy, omega, omega2z)
            else:
                omega2 = Matrix([0, 0, givenValue])
                omega2_vec = cartesianVector(np.array([0, 0, givenValue]))
                omega1_vec = f"\\omega_1 \\hat{{k}}"
                omega1z = symbols("omega1z")
                omega1 = Matrix([0, 0, omega1z])
                solveTuple = (vDx, vDy, vCx, vCy, omega, omega1z)

        eq1 = Eq(vD, omega1.cross(Matrix(rAD.tolist())))
        eq2 = Eq(vC, vD + omega3.cross(Matrix(rDC.tolist())))
        eq3 = Eq(vC, omega2.cross(Matrix(rBC.tolist())))

        soln = solve((eq1, eq2, eq3), solveTuple)
    omega = soln[omega]

    O = np.zeros(3)
    rA = O
    rB = rA + rAB
    rC = rB + rBC
    rD = rA + rAD

    scalar = 70

    bboxlist = [rA, rB, rC, rD]

    [bottomLeft, bottomRight, topLeft, topRight, center, extent] = boundingBox2D(
        bboxlist
    )

    points = bboxTranslate(center, bboxlist, 250, 155, scalar)

    Ax = points[0][0]
    Ay = points[0][1]

    Bx = points[1][0]
    By = points[1][1]

    Cx = points[2][0]
    Cy = points[2][1]

    Dx = points[3][0]
    Dy = points[3][1]

    data["params"]["Ax"] = Ax
    data["params"]["Ay"] = Ay
    data["params"]["Bx"] = Bx
    data["params"]["By"] = By
    data["params"]["Cx"] = Cx
    data["params"]["Cy"] = Cy
    data["params"]["Dx"] = Dx
    data["params"]["Dy"] = Dy

    drawGround = groundAtAngle([(Ax + Bx) / 2, (Ay + By) / 2 + 30], 0, 600)

    r = 0.5
    theta = 45.0
    [rAD_angle, rAD_PL_angle] = angleOf(rAD)
    [rBC_angle, rBC_PL_angle] = angleOf(rBC)
    [rDC_angle, rDC_PL_angle] = angleOf(rDC)

    rADAngle = np.degrees(rAD_angle)
    rBCAngle = np.degrees(rBC_angle)
    rDCAngle = np.degrees(rDC_angle)

    if (rADAngle - theta) < (rADAngle + theta):
        drawOmega1 = arcArrow(
            [Ax, Ay],
            rADAngle - theta,
            rADAngle + theta,
            scalar * r,
            label="\\omega_1",
            offsetx=-25.0,
            offsety=5.0,
            color="#64B400",
        )
    else:
        drawOmega1 = arcArrow(
            [Ax, Ay],
            rADAngle + theta,
            rADAngle - theta,
            scalar * r,
            label="\\omega_1",
            offsetx=-25.0,
            offsety=5.0,
            color="#64B400",
        )

    if (rBCAngle - theta) < (rBCAngle + theta):
        drawOmega2 = arcArrow(
            [Bx, By],
            rBCAngle - theta,
            rBCAngle + theta,
            scalar * r,
            label="\\omega_2",
            color="#64B400",
        )
    else:
        drawOmega2 = arcArrow(
            [Bx, By],
            rBCAngle + theta,
            rBCAngle - theta,
            scalar * r,
            label="\\omega_2",
            color="#64B400",
        )

    if (rDCAngle - theta) < (rDCAngle + theta):
        drawOmega3 = arcArrow(
            [Dx, Dy],
            rDCAngle - theta,
            rDCAngle + theta,
            scalar * r,
            label="\\omega_3",
            color="#64B400",
            offsetx=10.0,
            offsety=-10.0,
        )
    else:
        drawOmega3 = arcArrow(
            [Dx, Dy],
            rDCAngle + theta,
            rDCAngle - theta,
            scalar * r,
            label="\\omega_3",
            color="#64B400",
            offsetx=10.0,
            offsety=-10.0,
        )

    data["params"]["drawGround"] = drawGround
    data["params"]["drawOmega1"] = drawOmega1
    data["params"]["drawOmega2"] = drawOmega2
    data["params"]["drawOmega3"] = drawOmega3

    data["params"]["omega1_vec"] = omega1_vec
    data["params"]["omega2_vec"] = omega2_vec
    data["params"]["omega3_vec"] = omega3_vec

    data["params"]["rAB_vec"] = cartesianVector(rAB)
    data["params"]["rBC_vec"] = cartesianVector(rBC)
    data["params"]["rAD_vec"] = cartesianVector(rAD)
    data["params"]["rDC_vec"] = cartesianVector(rDC)

    # for pl-variable-output

    if givenIndex == 0:
        data["params"]["omega1"] = pl.to_json(np.array([0, 0, givenValue]))
        data["params"]["givenVar"] = "omega1"

    elif givenIndex == 1:
        data["params"]["omega2"] = pl.to_json(np.array([0, 0, givenValue]))
        data["params"]["givenVar"] = "omega2"

    else:
        data["params"]["omega3"] = pl.to_json(np.array([0, 0, givenValue]))
        data["params"]["givenVar"] = "omega3"

    data["params"]["rAB"] = pl.to_json(rAB)
    data["params"]["rBC"] = pl.to_json(rBC)
    data["params"]["rAD"] = pl.to_json(rAD)
    data["params"]["rDC"] = pl.to_json(rDC)

    data["params"]["findIndex"] = findIndex + 1
    data["correct_answers"]["omega"] = float(omega)

    return data
