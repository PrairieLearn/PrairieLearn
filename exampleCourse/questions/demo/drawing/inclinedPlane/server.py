import random
import math
import numpy as np

def generate(data):

        height_canvas = 400
        data["params"]["height_canvas"] = height_canvas

        a = random.choice([80,100,120])
        b = random.choice([140,150,160])
        c = random.choice([180,190,200,210])
        data["params"]["a"] = a
        data["params"]["b"] = b
        data["params"]["c"] = c        

        x1 = 80
        y1 = height_canvas - 80
        x2 = x1 + a
        y2 = y1 - c
        x3 = x2 + b
        y3 = y2

        x0 = x2
        y0 = y1

        data["params"]["x0"] = x0
        data["params"]["y0"] = y0
        data["params"]["x1"] = x1
        data["params"]["y1"] = y1
        data["params"]["x2"] = x2
        data["params"]["y2"] = y2
        data["params"]["x3"] = x3
        data["params"]["y3"] = y3

        circle_radius = 40
        data["params"]["circle_radius"] = circle_radius

        angle = -random.choice([30,40,50])
        theta_rad = angle*math.pi/180
        data["params"]["theta"] = angle
        data["params"]["normal_angle"] = angle - 90

        rC = np.array([x3,y3])
        e1 = np.array([math.cos(theta_rad), math.sin(theta_rad)])
        e2 = np.array([-math.sin(theta_rad), math.cos(theta_rad)])
        rD = rC + circle_radius*e2 - 100*e1
        base_triangle = 120
        rE = rD + np.array([ base_triangle,0])
        height_triangle = base_triangle*math.tan(theta_rad)
        rF = rE + np.array([0,height_triangle])


        data["params"]["xD"] = rD[0]
        data["params"]["yD"] = rD[1]
        data["params"]["xE"] = rE[0]
        data["params"]["yE"] = rE[1]
        data["params"]["xF"] = rF[0]
        data["params"]["yF"] = rF[1]

        width_canvas = rE[0] + 80
        data["params"]["width_canvas"] = width_canvas

        data["params"]["xG"] = x1
        data["params"]["yG"] = y2
        data["params"]["xH"] = x3
        data["params"]["yH"] = y1

        width_arrow = 60
        data["params"]["width_arrow"] = width_arrow



        return data
