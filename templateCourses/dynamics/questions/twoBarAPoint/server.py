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
	alpha1 = np.array([0, 0, randIntNonZero(-3, 3)])
	alpha2 = np.array([0, 0, randIntNonZero(-3, 3)])

	rOP = np.zeros(3)
	rPQ = np.zeros(3)
	angle = np.arctan2(rOP[1], rOP[0]) - np.arctan2(rPQ[1], rPQ[0])

	while angle < 0.1 or abs(angle - 0.5 * np.pi) < 0.1 or angle > 0.8 * np.pi:
		rOP = np.array([random.randint(-2, 2), random.randint(1, 3), 0])
		rPQ = randIntNonZeroArray(2, -2, 2)
		angle = np.arctan2(rOP[1], rOP[0]) - np.arctan2(rPQ[1], rPQ[0])

	aP = np.cross(alpha1, rOP) + np.cross(omega1, np.cross(omega1, rOP))
	aQ = aP + np.cross(alpha2, rPQ) + np.cross(omega2, np.cross(omega2, rPQ))

	findVar = random.choice(["\\vec{a}_P", "\\vec{a}_Q"])
	if findVar == "\\vec{a}_P":
		ansValue1 = aP[0]
		ansValue2 = aP[1]
	else:
		ansValue1 = aQ[0]
		ansValue2 = aQ[1]

	O = np.zeros(3)
	rP = rOP
	rQ = rOP + rPQ

	[bottomLeft, bottomRight, topLeft, topRight, center, extent] = boundingBox2D([O, rP, rQ])

	C = center

	Ox = 256 + 28*(O[0] - C[0])
	Oy = 175 - 28*(O[1] - C[1])

	Px = 256 + 28*(rP[0] - C[0])
	Py = 175 - 28*(rP[1] - C[1])

	Qx = 256 + 28*(rQ[0] - C[0])
	Qy = 175 - 28*(rQ[1] - C[0])

	data['params']['Ox'] = Ox
	data['params']['Oy'] = Oy
	data['params']['Px'] = Px
	data['params']['Py'] = Py
	data['params']['Qx'] = Qx
	data['params']['Qy'] = Qy
	data['params']['rOP_vec'] = cartesianVector(rOP)
	data['params']['rPQ_vec'] = cartesianVector(rPQ)
	data['params']['omega1_vec'] = cartesianVector(omega1)
	data['params']['omega2_vec'] = cartesianVector(omega2)
	data['params']['alpha1_vec'] = cartesianVector(alpha1)
	data['params']['alpha2_vec'] = cartesianVector(alpha2)
	data['params']['rOP'] = pl.to_json(rOP)
	data['params']['rPQ'] = pl.to_json(rPQ)
	data['params']['omega1'] = pl.to_json(omega1)
	data['params']['omega2'] = pl.to_json(omega2)
	data['params']['alpha1'] = pl.to_json(alpha1)
	data['params']['alpha2'] = pl.to_json(alpha2)
	data['params']['findVar'] = findVar

	data['correct_answers']['ansValue1'] = float(ansValue1)
	data['correct_answers']['ansValue2'] = float(ansValue2)

	return data

