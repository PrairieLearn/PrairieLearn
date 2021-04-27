import random
import math
import numpy as np

def generate(data):

        height_canvas = 400
        data["params"]["height_canvas"] = height_canvas

        a = random.choice([80,100,120])
        b = random.choice([140,150,160])
        c = random.choice([180,200,220])
        w = 20
        circle_radius = 10
        d = (w/2) + circle_radius
        data["params"]["a"] = a
        data["params"]["b"] = b
        data["params"]["c"] = c
        data["params"]["cby2"] = c/2
        data["params"]["w"] = w
        data["params"]["circle_radius"] = circle_radius

        xA = 120
        yA = height_canvas - 80
        xB = xA
        yB = yA - a
        xC = xA
        yC = yB - b
        xD = xB + c
        yD = yB
        xE = xB + c/2
        yE = yB + d

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
        data["params"]["xE"] = xE
        data["params"]["yE"] = yE

        width_arrow = 60
        data["params"]["width_arrow"] = width_arrow

        return data
