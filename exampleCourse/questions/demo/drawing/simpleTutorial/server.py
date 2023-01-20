import random
import math
import numpy as np

def generate(data):

        canvas_width = 300
        canvas_height = 300
        data["params"]["canvas_width"] = canvas_width
        data["params"]["canvas_height"] = canvas_height

        # Creating all variables, even knowing that just a few would be used in this Example
        # Could improve later
        # ------------------------------------------
        # point
        # ------------------------------------------
        x0 = 40
        y0 = 40
        interval = np.linspace(100,200,11)
        xP = random.choice(interval)
        data["params"]["xP"] = xP
        yP = random.choice(interval)
        data["params"]["xP"] = xP
        data["params"]["yP"] = yP
        data["params"]["x0"] = x0
        data["params"]["y0"] = canvas_height - y0
        # ------------------------------------------

        xA = 40
        xD = 260
        xB = random.randint(xA+20,xD/2)
        xC = random.randint(xB + 30,xD-20)
        y = 160
        w = xC-xB
        xE = xB + w/2

        data["params"]["xA"] = xA
        data["params"]["xB"] = xB
        data["params"]["xC"] = xC
        data["params"]["xD"] = xD
        data["params"]["xE"] = xE
        data["params"]["y"] = y
        data["params"]["w"] = w

        # ------------------------------------------
        # vector
        # ------------------------------------------
        allangles = [0,30,45,60,90]
        alpha = random.choice(allangles) if random.choice([0,1]) else -random.choice(allangles)
        data["params"]["alpha"] = alpha
        alphas = -alpha

        # ------------------------------------------
        # arc vector
        # ------------------------------------------
        if random.choice([0,1]):
            data["params"]["arc_orientation"] = "true"
            arc_orientation_text = "clockwise"
        else:
            data["params"]["arc_orientation"] = "false"
            arc_orientation_text = "counter-clockwise"

        # ------------------------------------------
        # distributed load
        # ------------------------------------------
        wmin = 20
        wmax = 60
        angle = random.choice([0,180])
        if random.choice([0,1]):
            comp = "larger "
            if angle == 0:
                data["params"]["w1"] = wmax
                data["params"]["w2"] = wmin
            else:
                data["params"]["w1"] = wmin
                data["params"]["w2"] = wmax
        else:
            comp = "smaller "
            if angle == 0:
                data["params"]["w1"] = wmin
                data["params"]["w2"] = wmax
            else:
                data["params"]["w1"] = wmax
                data["params"]["w2"] = wmin

        data["params"]["theta"] = angle
        orientation = "downwards" if angle == 0 else "upwards"

        # ------------------------------------------
        # torque
        # ------------------------------------------
        if random.choice([0,1]):
            torque_sign = "positive"
            data["params"]["gamma"] = 0
        else:
            torque_sign = "negative"
            data["params"]["gamma"] = 180


        for i in range(0,7):
            data["params"]["visible" + str(i)] = "false"

        question = random.choice([1,2,3,4,5,6])

        text = ""
        if (question == 1):
            text = "Add a point to position $(" + str(xP - x0) + "," + str(canvas_height - yP - y0) + ")$"
            text += " w.r.t. the origin $O$. Each square side has length 20."
            data["params"]["visible1"] = 'true'
        elif (question == 2):
            text = "Add a vector at $B$ with orientation $\\theta = $" + str(alphas)
            data["params"]["visible2"] = 'true'
            data["params"]["visible0"] = 'true'
        elif (question == 3):
            text =  "Add a " + str(arc_orientation_text) + " moment at $C$."
            data["params"]["visible3"] = 'true'
            data["params"]["visible0"] = 'true'
        elif (question == 4):
            text = "Apply an uniform distributed load to the beam below, on the interval from $B$ to $C$."
            text += " The load should point " + str(orientation) + "."
            data["params"]["visible4"] = 'true'
            data["params"]["visible0"] = 'true'
        elif (question == 5):
            text = "Apply a triangular distributed load to the beam below, on the interval from $B$ to $C$."
            text += " The load should point " + str(orientation) + "."
            text += " The magnitude (in absolute value) in $B$ is " + str(comp) + "than in $C$."
            data["params"]["visible5"] = 'true'
            data["params"]["visible0"] = 'true'
        elif (question == 6):
            text = "Apply a " + str(torque_sign) + " torque at $C$."
            data["params"]["visible6"] = 'true'
            data["params"]["visible0"] = 'true'

        data["params"]["text"] = text


        return data
