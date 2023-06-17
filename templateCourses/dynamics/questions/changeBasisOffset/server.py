import random
import numpy as np
from pl_random import *
from pl_template import *
from pl_geom import *
import prairielearn as pl

def generate(data):
	thetaDeg = random.choice([45, 135, -45, -135])
	theta = np.radians(thetaDeg)
	u = vector2DAtAngle(theta)
	v = perp(u)

	[uAngle, uPLAngle] = angleOf(u)
	[vAngle, vPLAngle] = angleOf(v)

	rOQ = np.array([random.choice([-1, 1]) * random.randint(3, 5), randIntNonZero(-2, 2), 0])
	rOP = np.array([randIntNonZero(-2, 2), random.choice([-1, 1]) * random.randint(2, 3), 0])
	rQP = rOP - rOQ

	rOPuv = np.array([np.dot(rOP, u), np.dot(rOP, v), 0])

	O = np.zeros(3)
	i = np.array([1, 0, 0])
	j = np.array([0, 1, 0])


	[bottomLeft, bottomRight, topLeft, topRight, center, extent] = boundingBox2D([O, rOQ, i, j, rOQ + u, rOQ + v, rOP])

	C = center

	Ox = 250 + 40*(O[0] - C[0])
	Oy = 155 - 40*(O[1] - C[1])
	Px = 250 + 40*(rOP[0] - C[0])
	Py = 155 - 40*(rOP[1] - C[1])
	Qx = 250 + 40*(rOQ[0] - C[0])
	Qy = 155 - 40*(rOQ[1] - C[1])

	theta = thetaDeg

	if theta > 0:
		Qoffsetx = 5
		Qoffsety = 5
	else:
		Qoffsetx = -20
		Qoffsety = -20

	if theta > 0:
		startAngle = uPLAngle
		endAngle = 0
		offsetx = 5
		offsety = -5
		drawStartArrow = "true"
		drawEndArrow = "false"
	else:
		startAngle = 0
		endAngle = uPLAngle
		offsetx = 10
		offsety = 10
		drawStartArrow = "false"
		drawEndArrow = "true"

	data['params']['u_theta'] = uPLAngle
	data['params']['v_theta'] = vPLAngle
	data['params']['theta'] = abs(theta)

	data['params']['Ox'] = Ox
	data['params']['Oy'] = Oy
	data['params']['Px'] = Px
	data['params']['Py'] = Py
	data['params']['Qx'] = Qx
	data['params']['Qy'] = Qy

	data['params']['rOQ_vec'] = cartesianVector(rOQ)
	data['params']['rQP_vec'] = cartesianVector(rQP)
	data['params']['rOQ'] = pl.to_json(rOQ)
	data['params']['rQP'] = pl.to_json(rQP)

	data['params']['Qoffsetx'] = Qoffsetx
	data['params']['Qoffsety'] = Qoffsety

	data['params']['startAngle'] = startAngle
	data['params']['endAngle'] = endAngle
	data['params']['offsetx'] = offsetx
	data['params']['offsety'] = offsety
	data['params']['drawStartArrow'] = drawStartArrow
	data['params']['drawEndArrow'] = drawEndArrow

	data['correct_answers']['rOPu'] = rOPuv[0]
	data['correct_answers']['rOPv'] = rOPuv[1]
	return data