import random
import numpy as np
from pl_random import *
from pl_template import *
from pl_geom import *
from pl_draw import *
import prairielearn as pl

def generate(data):
	dt = random.randint(2, 4)
	v = [1, 3, 5, 7, 9]
	random.shuffle(v)

	vp = []
	vp.append([0, v[0]])
	vp.append([dt, v[1]])

	for i in range(len(v) - 3):
		vp.append([(1 + 2*i) * dt, v[i+1]])
		vp.append([(2 + 2*i) * dt, (v[i+1] + v[i+2])/2])
		vp.append([(3 + 2*i) * dt, v[i+2]])

	vp.append([(2 * (len(v) - 3) + 1) * dt, v[len(v) - 2]])
	vp.append([(2 * (len(v) - 3) + 2) * dt, v[len(v) - 1]])

	iAns = 3 * random.randint(1, len(v) - 2)
	t = vp[iAns][0]

	t0 = vp[iAns - 1][0]
	v0 = vp[iAns - 1][1]
	t1 = t
	v1 = vp[iAns][1]
	sDDot = (v1 - v0)/(t1 - t0)

	data['params']['dt'] = float(dt)
	data['params']['vp'] = vp
	data['params']['iAns'] = float(iAns)
	data['params']['t'] = float(t)

	data['correct_answers']['sDDot'] = sDDot

	return data