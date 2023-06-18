import random
import numpy as np
import prairielearn as pl


def generate(data):
    thetaSign = random.choice([-1, 1])
    m = random.randint(3, 9)
    mu = random.randint(1, 15) / 8

    theta = np.arctan(mu)
    thetaDeg = np.degrees(theta)

    data["params"]["m"] = m
    data["params"]["mu"] = mu

    data["params"]["drawAngleGround"] = groundAtAngle([215, 140], 45, 500)

    data["correct_answers"]["theta"] = thetaDeg

    return data

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
