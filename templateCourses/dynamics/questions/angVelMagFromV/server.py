import numpy as np
import random
from pl_random import *
from pl_template import *
import prairielearn as pl

def generate(data):
	r = np.zeros(3)
	u = np.zeros(3)
	v = random.randint(2, 10)

	while np.linalg.norm(np.cross(u,r)) < 1:
		r = randIntNonZeroArray(3, -5, 5)
		u = randIntNonZeroArray(3, -5, 5)

	omegaHat = u/np.linalg.norm(u)
	omega = v/np.linalg.norm(np.cross(omegaHat,r))

	omegaHat = u/np.linalg.norm(u)
	omega = v/np.linalg.norm(np.cross(omegaHat,r))

	data['params']['x'] = float(r[0])
	data['params']['y'] = float(r[1])
	data['params']['z'] = float(r[2])

	data['params']['u_vec'] = cartesianVector(u)
	data['params']['u'] = pl.to_json(u)

	data['params']['v'] = v

	data['correct_answers']['omega'] = omega

	return data
	