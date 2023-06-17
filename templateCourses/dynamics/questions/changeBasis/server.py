import random
import numpy as np
from pl_random import *
from pl_template import *
from pl_geom import *
import prairielearn as pl

def generate(data):
	theta = (random.randint(4,7) * 10 + random.choice([0, 90])) * random.choice([-1, 1])
	thetaAbs = abs(theta)

	r = np.array([randIntNonZero(-3, 3), randIntNonZero(-3, 3), 0])

	u = vector2DAtAngle(np.radians(theta))
	v = perp(u)

	ru = np.dot(r, u)
	rv = np.dot(r, v)

	[uAngle, uPLAngle] = angleOf(u)
	[vAngle, vPLAngle] = angleOf(v)
	[rAngle, rPLAngle] = angleOf(r)

	data['params']['u_theta'] = uPLAngle
	data['params']['v_theta'] = vPLAngle
	data['params']['r_theta'] = rPLAngle
	data['params']['thetaAbs'] = thetaAbs
	data['params']['r_vec'] = cartesianVector(r)
	data['params']['r'] = pl.to_json(r)

	data['correct_answers']['ru'] = ru
	data['correct_answers']['rv'] = rv

	data['params']['rwidth'] = 44*np.linalg.norm(r)

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

	data['params']['startAngle'] = startAngle
	data['params']['endAngle'] = endAngle
	data['params']['offsetx'] = offsetx
	data['params']['offsety'] = offsety
	data['params']['drawStartArrow'] = drawStartArrow
	data['params']['drawEndArrow'] = drawEndArrow

	return data
