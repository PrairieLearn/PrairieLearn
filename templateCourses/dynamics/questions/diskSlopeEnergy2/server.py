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
	h = random.randint(10, 27)

	ansChoice = random.choice(["v0", "vf", "h"])

	if ansChoice == "v0":
		v0 = np.nan
		ansVar = "v_{C,0}"
		ansDesc = "speed $v_{C,0}$ of the hoop center at the initial position on the slope"
		ansUnits = "m/s"
	elif ansChoice == "vf":
		vf = np.nan
		ansVar = "v_{C,\\rm f}"
		ansDesc = "speed $v_{C,\\rm f}$ of the hoop center at the bottom of the slope"
		ansUnits = "m/s"
	else:
		h = np.nan
		ansVar = "h"
		ansDesc = "initial height $h$ of the hoop center"
		ansUnits = "m"

	descs = []

	if ansChoice != "v0":
		descs.append("speed of the hoop center at the initial position on the slope is $v_{C,0} = " + f'{v0}' + "\\rm\\ m/s$")
	if ansChoice != "vf":
		descs.append("speed of the hoop center at the bottom of the slope is $v_{C,\\rm f} = " + f'{vf}' + "\\rm\\ m/s$")

	if ansChoice != "h":
		descs.append("initial height of the hoop center on the slope is $h = " + f'{h}' + "\\rm\\ m$")

	random.shuffle(descs)

	m = random.randint(2, 9)
	r = random.randint(2, 5)
	desc1 = descs[0]
	desc2 = descs[1]
	orient = randSign()

	g = 9.8

	data['params']['m'] = float(m)
	data['params']['r'] = float(r)
	data['params']['desc1'] = desc1
	data['params']['desc2'] = desc2
	data['params']['ansChoice'] = ansChoice
	data['params']['ansDesc'] = ansDesc
	data['params']['ansVar'] = ansVar
	data['params']['ansUnits'] = ansUnits
	data['params']['orient'] = float(orient)

	if ansChoice == "v0":
		ans = np.sqrt(vf**2 - g*(h - r))
	elif ansChoice == "vf":
		ans = np.sqrt(v0**2 + g*(h - r))
	else:
		ans = (vf**2 - v0**2)/g + r

	data['correct_answers']['ans'] = float(ans)

	return data