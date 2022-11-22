import random
import math

def generate(data):

        height_canvas = 400
        data["params"]["height_canvas"] = height_canvas

        base_triangle = 180
        height_triangle = 240

        xA = 40
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

        base_rectangle = 80
        height_rectangle = 280

        xD = 300
        yD = 200

        data["params"]["xD"] = xD
        data["params"]["yD"] = yD
        data["params"]["base_rectangle"] = base_rectangle
        data["params"]["height_rectangle"] = height_rectangle


        return data
