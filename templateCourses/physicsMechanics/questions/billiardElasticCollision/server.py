import math
import random


def create_dict_xy_coord(p):
    return '{"x": ' + str(p[0]) + ',"y": ' + str(p[1]) + "}"


def generate(data):

    theta1 = 50
    data["params"]["theta"] = [theta1, theta1 - 90]
    theta1 = theta1 * math.pi / 180
    v0 = random.randint(1, 4)
    data["params"]["v0"] = v0

    # option to implement variations of this question
    message = "if $\\theta = $" + str(data["params"]["theta"][0])
    message += "$^o$ is the angle between the $x$-direction and the $v_2$ vector"
    data["params"]["statement"] = message
    v1 = v0 * math.sin(theta1)
    data["correct_answers"]["v1"] = v1

    ####################################
    ### variables for plotting purposes
    ####################################

    # origin
    Ori = [40, 170]
    data["params"]["V_origin"] = create_dict_xy_coord(Ori)

    r = 20  # ball radius
    data["params"]["r"] = r

    # traveling ball 1
    d = 60
    xA = Ori[0] + d
    yA = Ori[1]
    data["params"]["pA"] = [xA, yA]

    # ball 1 at striking location
    d1 = 140
    xB = xA + d1
    yB = yA
    data["params"]["pB"] = [xB, yB]

    # stationary ball 2
    xC = xB + 2 * r * math.cos(theta1)
    yC = yB - 2 * r * math.sin(theta1)
    data["params"]["pC"] = [xC, yC]

    # stationary ball 2 after collision
    d2 = 120
    xD = xB + d2 * math.cos(theta1)
    yD = yB - d2 * math.sin(theta1)
    data["params"]["pD"] = [xD, yD]

    # traveling ball 1 after collision
    d3 = 100
    xE = xB + d3 * math.sin(theta1)
    yE = yB + d3 * math.cos(theta1)
    data["params"]["pE"] = [xE, yE]
