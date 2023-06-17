import random
import numpy as np
import sympy as sp
import prairielearn as pl
from pl_random import *
from pl_template import *
from pl_geom import *


def generate(data):
	t, C = sp.symbols('t, C')

	t_value = random.randint(2, 5)
	r0 = random.choice([3,4,5,6,7,8,9])
	theta0 = random.choice([2,3,4,6])

	ercomp = random.choice([2,3,4,5])
	ercomp *= random.choice([-1,1])
	ethcomp = 0
	
	
	r_expr_with_C = ercomp * t + C
	r_expr = integrate(ercomp, t)

	C1 = float(r0 - float(r_expr.subs(t, 0).evalf()))

	t_value = random.randint(2, 3)
	
	r = r_expr + C1
	#C2 = float(theta0 - ethcomp/ercomp * log(C1))
	#theta_t_value = ethcomp/ercomp * log(ercomp*t_value + C1) + C2
	r_f = r.subs(t, t_value)

	v = np.array([ercomp, ethcomp,0])

	data['params']['v'] = polarVector(v)
	#data['params']['x0'] = x0
	#data['params']['y0'] = y0
	data['params']['t'] = t_value
	data['params']['r0'] = r0
	data['params']['theta0'] = theta0

	data['correct_answers']['symbolic_r'] = pl.to_json(r_expr_with_C)
	data['correct_answers']['rdot'] = float(ercomp)
	data['correct_answers']['eth_comp'] = float(ethcomp)
	data['correct_answers']['final_r'] = pl.to_json(ercomp*t + int(C1))
	data['correct_answers']['r_0'] = float(r0)
	data['correct_answers']['r_f'] = float(r_f)
	data['correct_answers']['theta_f'] = np.pi/theta0
	
	return data












