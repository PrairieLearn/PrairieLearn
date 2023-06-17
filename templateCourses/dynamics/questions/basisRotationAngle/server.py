import numpy as np
import random
from pl_template import *
import prairielearn as pl

def generate(data):
	theta = (random.randint(0, 3)/2 + random.uniform(0.1, 0.4)) * np.pi
	u = np.array([np.cos(theta), np.sin(theta)])
	v = np.array([-float(u[1]), float(u[0])])

	r = np.round(np.array([random.uniform(3,6), random.uniform(0, 2*np.pi)]), 3)
	rUV = np.round(np.array([np.dot(r, u), np.dot(r,v)]), 3)

	data['params']['rij_vec'] = cartesianVector(r)
	data['params']['rUV_vec'] = vectorInBasis(rUV, "\\hat{u}", "\\hat{v}", "")
	data['params']['rij'] = pl.to_json(r)
	data['params']['ruv'] = pl.to_json(rUV)

	data['correct_answers']['theta'] = theta

	return data