import numpy as np
import random
import prairielearn as pl
from pl_random import *
from pl_template import *

def generate(data):
	omega = np.zeros(3)
	r = np.zeros(3)
	while np.linalg.norm(np.cross(omega, r)) < 1:
		omega = randIntNonZeroArray(3, -3, 3)
		r = randIntNonZeroArray(3, -5, 5)

	v = np.cross(omega, r)

	data['params']['x'] = float(r[0])
	data['params']['y'] = float(r[1])
	data['params']['z'] = float(r[2])
	data['params']['omega_vec'] = cartesianVector(omega)
	data['params']['omega'] = pl.to_json(omega)

	data['correct_answers']['vx'] = float(v[0])
	data['correct_answers']['vy'] = float(v[1])
	data['correct_answers']['vz'] = float(v[2])

	return data
