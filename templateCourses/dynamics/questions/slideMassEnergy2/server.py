import random
import numpy as np
from pl_random import *
from pl_template import *
from pl_geom import *
from pl_draw import *
import prairielearn as pl

def generate(data):
    v0 = random.randint(2, 15)
    vf = random.randint(20, 39)
    h = random.randint(2, 17)
    ansVar = random.choice(["v_0", "v_{\\rm f}", "h"])

    g = 9.8
    if ansVar == "v_0":
        v0 = np.nan
        ansDesc = "speed $v_0$ of the mass at the initial position on the slope"
        ansUnits = "m/s"
        ans = np.sqrt(vf**2 - 2*g*h)
    elif ansVar == "v_{\\rm f}":
        vf = np.nan
        ansDesc = "speed $v_{\\rm f}$ of the mass at the bottom of the slope"
        ansUnits = "m/s"
        ans = np.sqrt(v0**2 + 2*g*h)
    else:
        h = np.nan
        ansDesc = "initial height $h$ of the mass"
        ansUnits = "m"
        ans = 0.5 * (vf**2 - v0**2)/g

    descs = []
    if ansVar != "v_0":
        descs.append("speed of the mass at the initial position on the slope is $v_0 = " + f'{v0}' + "\\rm\\ m/s$")
    if ansVar != "v_{\\rm f}":
        descs.append("speed of the mass at the bottom of the slope is $v_{\\rm f} = " + f'{vf}' + "\\rm\\ m/s$")
    if ansVar != "h":
        descs.append("initial height of the mass on the slope is $h = " + f'{h}' + "\\rm\\ m$")

    random.shuffle(descs)

    m = random.randint(2, 9)
    orient = randSign()

    data['params']['m'] = float(m)
    data['params']['desc1'] = descs[0]
    data['params']['desc2'] = descs[1]
    data['params']['ansDesc'] = ansDesc
    data['params']['ansUnits'] = ansUnits
    data['params']['ansVar'] = ansVar
    data['correct_answers']['ans'] = ans
    data['params']['orient'] = float(orient)

    return data