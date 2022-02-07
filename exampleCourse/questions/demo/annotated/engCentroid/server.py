import random
import math

def generate(data):

    height_canvas = 400
    data["params"]["height_canvas"] = height_canvas
    base_triangle   = random.choice([120,140,160,180,200,220])
    height_triangle = random.choice([120,140,160,180,200,220,240,260,280])

    xA = 60
    yA = height_canvas - 80

    xB = xA + base_triangle
    yB = yA

    xC = xB
    yC = yB - height_triangle

    xO = xA + (2/3)*base_triangle
    yO = yB - (1/3)*height_triangle

    data["params"]["xA"] = xA
    data["params"]["yA"] = yA
    data["params"]["xB"] = xB
    data["params"]["yB"] = yB
    data["params"]["xC"] = xC
    data["params"]["yC"] = yC
    data["params"]["xO"] = xO
    data["params"]["yO"] = yO
