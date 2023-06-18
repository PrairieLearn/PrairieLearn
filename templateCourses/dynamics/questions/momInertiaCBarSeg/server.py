import random

import numpy as np


def generate(data):
    width = random.randint(2, 3)
    rhos = NChoice(3, [i for i in range(1, 10)])
    length = random.randint(15, 18)
    l1 = random.randint(3, 6)
    l2 = random.randint(3, 6)
    l3 = length - l1 - l2
    lengths = [l1, l2, l3]
    random.shuffle(lengths)

    rho1 = rhos[0]
    rho2 = rhos[1]
    rho3 = rhos[2]
    l1 = lengths[0]
    l2 = lengths[1]
    l3 = lengths[2]

    angle = random.choice([-1, 1]) * (
        randIntNonZero(1, 3) / 18 * np.pi + random.choice([0, np.pi])
    )

    angle_PL = np.degrees(PL_angle(angle))

    m1 = rho1 * width * l1
    m2 = rho2 * width * l2
    m3 = rho3 * width * l3
    m = m1 + m2 + m3

    C1 = np.array([l1 / 2, width / 2, 0])
    C2 = np.array([l1 + l2 / 2, width / 2, 0])
    C3 = np.array([l1 + l2 + l3 / 2, width / 2, 0])
    C = 1 / m * (m1 * C1 + m2 * C2 + m3 * C3)

    I1 = 1 / 12 * m1 * (width**2 + l1**2)
    I2 = 1 / 12 * m2 * (width**2 + l2**2)
    I3 = 1 / 12 * m3 * (width**2 + l3**2)

    IC = (
        I1
        + m1 * np.dot(C - C1, C - C1)
        + I2
        + m2 * np.dot(C - C2, C - C2)
        + I3
        + m3 * np.dot(C - C3, C - C3)
    )

    data["params"]["l1"] = float(l1)
    data["params"]["l2"] = float(l2)
    data["params"]["l3"] = float(l3)
    data["params"]["rho1"] = float(rho1)
    data["params"]["rho2"] = float(rho2)
    data["params"]["rho3"] = float(rho3)
    data["params"]["w"] = float(width)

    # pl-variable-output
    pl_var_output_list = []
    for i in range(len(lengths)):
        params_name_l = "l" + f"{i+1}"
        params_name_rho = "rho" + f"{i+1}"
        varoutput_l = (
            f'<variable params-name="{params_name_l}">{params_name_l}</variable>'
        )
        varoutput_rho = (
            f'<variable params-name="{params_name_rho}">{params_name_rho}</variable>'
        )
        pl_var_output_list.append(varoutput_l)
        pl_var_output_list.append(varoutput_rho)

    pl_var_output = "\n".join(pl_var_output_list)
    data["params"]["pl_var_output"] = pl_var_output

    # pl-drawing

    u1 = vector2DAtAngle(angle)
    u2 = perp(u1)

    x1 = -length / 2 + l1 / 2
    x2 = -length / 2 + l1 + l2 / 2
    x3 = -length / 2 + l1 + l2 + l3 / 2

    R1c = x1 * u1
    R2c = x2 * u1
    R3c = x3 * u1

    points = [R1c, R2c, R3c]

    translated_centers = bboxTranslate(np.zeros(3), points, 200, 125, 17)

    # pl-dimensions
    g = 0.5
    P = -length / 2 * u1 + (-width / 2 - g) * u2

    points = [
        P,
        P + l1 * u1,
        P + (l1 + l2) * u1,
        P + (l1 + l2 + l3) * u1,
        (-length / 2 - g) * u1 + width / 2 * u2,
        (-length / 2 - g) * u1 - width / 2 * u2,
    ]

    translated_measurements = bboxTranslate(np.zeros(3), points, 200, 125, 17)

    drawList = []

    # For color-density shading
    rhoMin = min(rho1, rho2, rho3)
    rhoMax = max(rho1, rho2, rho3)

    c1 = int(linearMap(rhoMin, rhoMax, 240, 200, rho1))
    c2 = int(linearMap(rhoMin, rhoMax, 240, 200, rho2))
    c3 = int(linearMap(rhoMin, rhoMax, 240, 200, rho3))

    c = [c1, c2, c3]

    for i in range(len(lengths)):
        drawRectangle = f"<pl-rectangle x1={translated_centers[i][0]} y1={translated_centers[i][1]} width={17*lengths[i]} height={17*width} angle={angle_PL} color={rgb_to_hex((c[i], c[i], c[i]))} stroke-width=2.0></pl-rectangle>"
        currentLength = "\\\\ell_" + f"{i+1}"
        drawDimension = f'<pl-dimensions x1={translated_measurements[i][0]} y1={translated_measurements[i][1]} x2={translated_measurements[i+1][0]} y2={translated_measurements[i+1][1]} label="{currentLength}" stroke-width=0.7></pl-dimensions>'
        drawList.append(drawRectangle)
        drawList.append(drawDimension)

    drawCode = "\n".join(drawList)

    drawWidth = f'<pl-dimensions x1={translated_measurements[-2][0]} y1={translated_measurements[-2][1]} x2={translated_measurements[-1][0]} y2={translated_measurements[-1][1]} label="w" stroke-width=0.7></pl-dimensions>'

    drawCode += drawWidth

    data["params"]["drawCode"] = drawCode

    data["correct_answers"]["IC"] = IC
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


def PL_angle(x):
    """x: angle measured counterclockwise from the x
    returns the adjusted angle for pl-drawing"""

    if x > 0:
        x_pl = -x
    else:
        x_pl = abs(x)

    return x_pl


def vector2DAtAngle(x):
    """x: angle measured from the x-axis, in radians
    returns unit vector of size (3,)"""
    return np.array([np.cos(x), np.sin(x), 0])


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


def perp(v):
    """v: numpy array of size (n,)
       n: size of the array
    returns the counterclockwise orthogonal vector to v
    """
    return np.array([-v[1], v[0], 0])


def NChoice(n, l):
    if n > len(l):
        return l

    choice = []

    for i in range(n):
        x = random.choice(l)
        choice.append(x)
        l.remove(x)
    return choice


def linearInterp(x0, x1, alpha):
    """x0: first number
    x1: second number
    alpha: The propotion of x1 versus x0 (between 0 and 1)
    """
    return (1 - alpha) * x0 + alpha * x1


def linearDeinterp(x0, x1, x):
    """x0: first number
    x1: second number
    x: the value to be de-interpolated
    """
    return (x - x0) / (x1 - x0)


def linearMap(x0, x1, y0, y1, x):
    """x0: first number
    x1: second number
    y0: the image of x0
    y1: the image of x1
    x: the value to be mapped
    returns the value y that x maps to
    """
    return linearInterp(y0, y1, linearDeinterp(x0, x1, x))


def rgb_to_hex(rgb):
    return ("#%02x%02x%02x" % rgb).upper()
