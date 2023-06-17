import random
import numpy as np
from pl_random import *
from pl_template import *
from pl_geom import *
from pl_draw import *
import prairielearn as pl

def generate(data):
	m = random.randint(2, 9)
	h = random.randint(5, 19)
	v0 = random.randint(2, 9)
	vf = random.randint(2, 9)
	orient = randSign()

	g = 9.8

	W = m*(0.5 * vf**2 - 0.5 * v0**2 - g*h)

	data['params']['m'] = float(m)
	data['params']['h'] = float(h)
	data['params']['v0'] = float(v0)
	data['params']['vf'] = float(vf)
	data['params']['orient'] = float(orient)

	data['correct_answers']['W'] = W

	return data