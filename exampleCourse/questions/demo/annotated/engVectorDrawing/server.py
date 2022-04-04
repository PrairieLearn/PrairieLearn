import random
import math
import numpy as np

def generate(data):

    canvas_width = 440
    canvas_height = 300

    # ------------------------------------------
    # point
    # ------------------------------------------
    interval = np.arange(60,200,20)
    xP = random.choice(interval)
    data["params"]["xP"] = int(xP)
    yP = random.choice(interval)
    data["params"]["yP"] = int(yP)

    # ------------------------------------------
    # vector
    # ------------------------------------------
    allangles = [0,30,45,60,90]
    alpha = random.choice(allangles)
    data["params"]["alpha_abs"] = alpha
    if random.choice([0,1]):
        data["params"]["alpha"] = alpha
        data["params"]["direction"] = "clockwise"
    else:
        data["params"]["alpha"] = -alpha
        data["params"]["direction"] = "counter-clockwise"
