import random
import numpy as np
from pl_random import *
from pl_template import *
from pl_geom import *
from pl_draw import *
import prairielearn as pl

def generate(data):
	angle = 0

	while angle < 0.1 or abs(angle - 0.5*np.pi) < 0.1 or angle > 0.8*np.pi:
		rOP = np.array([random.randint(-2, 2), random.randint(1,3), 0])
		rPQ = randIntNonZeroArray(2, -2, 2)
		rOPAngle = np.arctan2(rOP[1], rOP[0])
		rPQAngle = np.arctan2(rPQ[1], rOP[1])

		if rOPAngle < 0:
			rOPAngle += 2*np.pi

		if rPQAngle < 0:
			rPQAngle += 2*np.pi

		angle = rOPAngle - rPQAngle

	m1 = 0
	m2 = 0

	while m1 == m2:
		m1 = random.randint(2, 9)
		m2 = random.randint(2, 9)

	rOC1 = 0.5*rOP
	rOC2 = rOP + 0.5*rPQ
	g = 9.8

	V = m1*g*rOC1[1] + m2*g*rOC2[1]

	# for pl-drawing
	O = np.zeros(3)
	rP = rOP
	rQ = rOP + rPQ

	[bottomLeft, bottomRight, topLeft, topRight, center, extent] = boundingBox2D([O, rP, rQ])

	C = center

	translated_points = bboxTranslate(C, [O, rP, rQ], 251, 155, 40)

	Ox = translated_points[0][0]
	Oy = translated_points[0][1]

	Px = translated_points[1][0]
	Py = translated_points[1][1]

	Qx = translated_points[2][0]
	Qy = translated_points[2][1]

	data['params']['Ox'] = Ox
	data['params']['Oy'] = Oy
	data['params']['Px'] = Px
	data['params']['Py'] = Py
	data['params']['Qx'] = Qx
	data['params']['Qy'] = Qy

	data['params']['rOPvec'] = cartesianVector(rOP)
	data['params']['rPQvec'] = cartesianVector(rPQ)

	data['params']['rOP'] = pl.to_json(rOP)
	data['params']['rPQ'] = pl.to_json(rPQ)
	data['params']['m1'] = float(m1)
	data['params']['m2'] = float(m2)

	data['correct_answers']['V'] = V

	return data 	