import random
import numpy as np
import prairielearn as pl
from sympy import *

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

def NChoice(n, l):
    if n > len(l):
        return l

    choice = []

    for i in range(n):
        x = random.choice(l)
        choice.append(x)
        l.remove(x)
    return choice

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

def bboxTranslate(C, points, offsetx, offsety, width=30):
    translated_points = []
    """C: Center of the bounding box as a numpy array
    points: List of vectors to offset from the center
    offsetx: The x-offset from the top left corner, usually half the width of the figure
    offsety: The y-offset from the top left corner, usually half the height of the figure
    width: Width of the vector offset, default 30

    returns the 2D offset (corrected) points for pl-drawing"""

    for i in range(len(points)):
        x_translated = offsetx + width * (points[i][0] - C[0])
        y_translated = offsety - width * (points[i][1] - C[1])
        translated_points.append(np.array(([x_translated, y_translated, 0])))

    return translated_points

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

def PL_angle(x):
    """x: angle measured counterclockwise from the x
    returns the adjusted angle for pl-drawing"""

    if x > 0:
        x_pl = -x
    else:
        x_pl = abs(x)

    return x_pl

def groundAtAngle(P, angle, width):
    """P: Location of the ground's center, in PL coordinates
       angle: angle of ground, in degrees
       width: width of the ground
    returns the pl-drawing code that draws ground at an angle. should be combined with ground() eventually"""

    angle_for_line = np.radians(angle)
    angle_for_rectangle = PL_angle(angle)

    linex1 = P[0] - width / 2 * np.cos(angle_for_line)
    liney1 = P[1] + width / 2 * np.sin(angle_for_line)

    linex2 = P[0] + width / 2 * np.cos(angle_for_line)
    liney2 = P[1] - width / 2 * np.sin(angle_for_line)

    rectx = P[0] + 6 * np.sin(np.radians(angle))
    recty = P[1] + 5 * np.cos(np.radians(angle))

    """<pl-rectangle x1="224" y1="140" width="502" height="8" angle="-45" stroke-width="0" color="#DCDCDC"></pl-rectangle>"""

    drawAngleGround = f'<pl-line x1={linex1} y1={liney1} x2={linex2} y2={liney2}></pl-line><pl-rectangle x1={rectx} y1={recty} width={width} height="8" angle={angle_for_rectangle} stroke-width="0" color="#DCDCDC"></pl-rectangle>'

    return drawAngleGround

def arcArrow(
    C,
    start,
    end,
    radius,
    counterclockwise=True,
    offsetx=-15.0,
    offsety=-5.0,
    label="",
    color="#000000",
):
    """C: center of the arc, as a list
    start: start angle in degrees
    end: end angle in degrees
    radius: radius of the arc
    label: string label of the arc
    returns the counterclockwise arc, instead of clockwise arc in pl-arc-dimensions by default
    """
    start_angle = PL_angle(start)
    end_angle = PL_angle(end)

    label = "\\" + label if label != "" else ""

    if counterclockwise:
        drawArcArrow = f'<pl-arc-dimensions x1={C[0]} y1={C[1]} start-angle={end_angle} end-angle={start_angle} draw-start-arrow="true" draw-end-arrow="false" label="{label}" offsetx={offsetx} offsety={offsety} radius={radius} stroke-width="2" stroke-color={color}></pl-arc-dimensions>'
    else:
        drawArcArrow = f'<pl-arc-dimensions x1={C[0]} y1={C[1]} start-angle={end_angle} end-angle={start_angle} draw-start-arrow="false" draw-end-arrow="true" label="{label}" offsetx={offsetx} offsety={offsety} radius={radius} stroke-width="2" stroke-color={color}></pl-arc-dimensions>'

    return drawArcArrow