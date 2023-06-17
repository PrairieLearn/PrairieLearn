import random
import numpy as np
from pl_random import *
from pl_template import *
from pl_geom import *
from pl_draw import *
import prairielearn as pl

def generate(data):
	omega1 = np.array([0, 0, randIntNonZero(-3, 3)])
	omega2 = np.array([0, 0, randIntNonZero(-3, 3)])

	rOP = np.zeros(3)
	rPQ = np.zeros(3)
	angle = np.arctan2(rOP[1], rOP[0]) - np.arctan2(rPQ[1], rPQ[0])

	while angle < 0.1 or abs(angle - 0.5 * np.pi) < 0.1 or angle > 0.8 * np.pi:
		rOP = np.array([random.randint(-2, 2), random.randint(1, 3), 0])
		rPQ = randIntNonZeroArray(2, -2, 2)
		angle = np.arctan2(rOP[1], rOP[0]) - np.arctan2(rPQ[1], rPQ[0])

	vP = np.cross(omega1, rOP)
	vQ = vP + np.cross(omega2, rPQ)

	findVar = random.choice(["\\vec{\\omega}_1", "\\vec{\\omega}_2"])
	if findVar == "\\vec{\\omega}_1":
		omega = omega1[2]
	else:
		omega = omega2[2]

	O = np.zeros(3)
	rP = rOP
	rQ = rOP + rPQ

	[bottomLeft, bottomRight, topLeft, topRight, center, extent] = boundingBox2D([O, rP, rQ])

	C = center

	Ox = 256 + 22*(O[0] - C[0])
	Oy = 175 - 22*(O[1] - C[1])

	Px = 256 + 22*(rP[0] - C[0])
	Py = 175 - 22*(rP[1] - C[1])

	Qx = 256 + 22*(rQ[0] - C[0])
	Qy = 175 - 22*(rQ[1] - C[0])

	[vQ_angle, vQ_PL_angle] = angleOf(vQ)

	data['params']['Ox'] = Ox
	data['params']['Oy'] = Oy
	data['params']['Px'] = Px
	data['params']['Py'] = Py
	data['params']['Qx'] = Qx
	data['params']['Qy'] = Qy
	data['params']['rOP_vec'] = cartesianVector(rOP)
	data['params']['rPQ_vec'] = cartesianVector(rPQ)
	data['params']['vQ_vec'] = cartesianVector(vQ)
	data['params']['rOP'] = pl.to_json(rOP)
	data['params']['rPQ'] = pl.to_json(rPQ)
	data['params']['vQ'] = pl.to_json(vQ)
	data['params']['findVar'] = findVar

	data['params']['vQ_angle'] = vQ_PL_angle
	data['params']['vQ_width'] = 10*np.linalg.norm(vQ)

	data['correct_answers']['omega'] = float(omega)

	return data

