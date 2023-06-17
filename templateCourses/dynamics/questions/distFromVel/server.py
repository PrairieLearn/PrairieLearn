from sympy import *
import numpy as np
import random
from pl_random import *

def generate(data):

	t = symbols('t')

	v = Matrix([randPoly(t, 2), randPoly(t, 2)])

	t_value = random.choice([1, 2, 3])

	r = integrate(v, t)

	r_value = r.subs(t, t_value)

	r_answer = float(r_value.norm().evalf())

	data['params']['v_x'] = latex(v[0])
	data['params']['v_y'] = latex(v[1])

	# for copyable inputs
	data['params']['vx'] = str(v[0])
	data['params']['vy'] = str(v[1])
	data['params']['t'] = t_value

	data['correct_answers']['r'] = r_answer

	return data
