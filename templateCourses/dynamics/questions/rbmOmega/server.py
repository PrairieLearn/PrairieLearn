import random
import numpy as np
from pl_random import *
from pl_template import *
import prairielearn as pl

def generate(data):
	omega = np.array([0,0,randIntNonZero(-5, 5)])
	rPQ = randIntNonZeroArray(2, -5, 5)
	vP = randIntNonZeroArray(2, -5, 5)

	vQ = vP + np.cross(omega, rPQ)

	offset = vQ - vP

	halfOffset = np.rint(np.array([float(offset[0])/2, float(offset[1])/2, 0]))

	vP = (vP - halfOffset).astype(int)
	vQ = (vQ - halfOffset).astype(int)

	data['params']['rPQ_vec'] = cartesianVector(rPQ)
	data['params']['vP_vec'] = cartesianVector(vP)
	data['params']['vQ_vec'] = cartesianVector(vQ)
	data['params']['rPQ'] = pl.to_json(rPQ)
	data['params']['vP'] = pl.to_json(vP)
	data['params']['vQ'] = pl.to_json(vQ)
	data['correct_answers']['omega'] = float(omega[2])

	return data