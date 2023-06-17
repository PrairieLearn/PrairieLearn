import random
import numpy as np
from pl_random import *
from pl_template import *
from pl_geom import *
from pl_draw import *
import prairielearn as pl

def generate(data):

	a = np.zeros(3)
	cDotA = 0
	cDotB = 0

	while abs(abs(float(a[0])) - abs(float(a[1]))) < 1e-6 or \
	abs(float(a[0])) < 1e-6 or abs(float(a[1]))< 1e-6 or np.linalg.norm(a) < 1.5 or \
	abs(abs(cDotA) - abs(cDotB)) < 1e-6:
		a = randIntNonZeroArray(2, -4, 4)
		cDotA = randIntNonZero(-10, 10)
		cDotB = randIntNonZero(-10, 10)

	b = perp(a) * random.choice([-1, 1])
	ax = float(a[0])
	ay = float(a[1])

	bx = float(b[0])
	by = float(b[1])

	A = np.array([[ax, ay], [bx, by]])
	g = np.array([[cDotA], [cDotB]])

	c = np.linalg.solve(A, g)

	O = np.zeros(3)

	[bottomLeft, bottomRight, topLeft, topRight, center, extent] = boundingBox2D([O, a, b])

	C = center

	Ox = 250 + 30*(O[0] - C[0])
	Oy = 155 - 30*(O[1] - C[1])

	O = np.array([Ox, Oy, 0])

	data['params']['a_vec'] = cartesianVector(a)
	data['params']['a'] = pl.to_json(a)
	[aAngle, aPLAngle] = angleOf(a)
	[bAngle, bPLAngle] = angleOf(b)

	data['params']['a_angle'] = aPLAngle
	data['params']['b_angle'] = bPLAngle
	data['params']['cDotA'] = cDotA
	data['params']['cDotB'] = cDotB

	amag = np.linalg.norm(a)
	data['params']['width'] = amag*35
	data['params']['Ox'] = Ox
	data['params']['Oy'] = Oy
	data['params']['drawRightAngle'] = rightAngle(O, a, b)
	data['correct_answers']['cx'] = float(c[0])
	data['correct_answers']['cy'] = float(c[1])

	return data