import random
import math
import numpy as np
import numpy.linalg as la

def generate(data):

        height_canvas = 400
        data["params"]["height_canvas"] = height_canvas

        # parameters for the T-shape rod
        a = random.choice([80,90,100,110,120])
        b = random.choice([150,160,170,180])
        c = random.choice([180,190,200,210])
        d = random.randint(b+60,2*b-60)
        wrod = 20
        data["params"]["a"] = a
        data["params"]["b"] = b
        data["params"]["c"] = c
        data["params"]["d"] = d
        data["params"]["wrod"] = wrod

        xA = 100
        yA = 140
        xB = xA + b
        yB = yA + a
        xC = xA + b
        yC = yA
        xD = xC + b
        yD = yC

        width_canvas = xD + 100
        data["params"]["width_canvas"] = width_canvas

        x0 = 20
        y0 = height_canvas - 20

        data["params"]["x0"] = x0
        data["params"]["y0"] = y0
        data["params"]["xA"] = xA
        data["params"]["yA"] = yA
        data["params"]["xB"] = xB
        data["params"]["yB"] = yB
        data["params"]["xC"] = xC
        data["params"]["yC"] = yC
        data["params"]["xD"] = xD
        data["params"]["yD"] = yD

        # parameters for the wheels and track

        circle_radius = 30
        data["params"]["circle_radius"] = circle_radius

        length_track = np.sqrt(a**2 + b**2) + 4*circle_radius
        data["params"]["length_track"] = length_track

        rA = np.array([xA,yA])
        e1 = np.array([b, a])
        e1 = e1/la.norm(e1,2)
        e2 = np.array([-a, b])
        e2 = e2/la.norm(e2,2)
        rE = rA + circle_radius*e2
        rF = rE - 2*circle_radius*e1
        rG = rE + length_track*e1
        rH = rF - 2*circle_radius*e2
        rI = rG - 2*circle_radius*e2

        data["params"]["xE"] = rE[0]
        data["params"]["yE"] = rE[1]
        data["params"]["xF"] = rF[0]
        data["params"]["yF"] = rF[1]
        data["params"]["xG"] = rG[0]
        data["params"]["yG"] = rG[1]
        data["params"]["xH"] = rH[0]
        data["params"]["yH"] = rH[1]
        data["params"]["xI"] = rI[0]
        data["params"]["yI"] = rI[1]

        width_arrow = 60
        data["params"]["width_arrow"] = width_arrow

        theta_rad = math.atan2(a,b)
        theta = theta_rad*180/math.pi
        theta_op = theta + 180
        data["params"]["theta_op"] = theta_op
        data["params"]["theta_normal"] = theta - 90

        # parameters for the box
        wbox = 40
        xbox = xA + d
        ybox = yA - wrod/2 - wbox/2
        data["params"]["wbox"] = wbox
        data["params"]["xbox"] = xbox
        data["params"]["ybox"] = ybox

        return data
