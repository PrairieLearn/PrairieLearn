import random
import numpy as np
from pl_random import *
from pl_template import *
import prairielearn as pl

def generate(data):
	omega = np.array([0, 0, randIntNonZero(-2, 2)])
	rPQ = randIntNonZeroArray(2, -5, 5)
	vP = randIntNonZeroArray(2, -5, 5)

	vQ = vP + np.cross(omega, rPQ)

	data['params']['rPQ_vec'] = cartesianVector(rPQ)
	data['params']['vP_vec'] = cartesianVector(vP)
	data['params']['omega_vec'] = cartesianVector(omega)

	data['params']['rPQ'] = pl.to_json(rPQ)
	data['params']['vP'] = pl.to_json(vP)
	data['params']['omega'] = pl.to_json(omega)

	data['correct_answers']['vQx'] = float(vQ[0])
	data['correct_answers']['vQy'] = float(vQ[1])

	return data
	