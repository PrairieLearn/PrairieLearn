from sympy import *
import numpy as np
import random
from pl_random import *

def generate(data):

	t = symbols('t')

	r = randFuncArray(t, 3)

	t_value = random.randint(0, 2)

	v = diff(r, t)

	v_value = v.subs(t, t_value)

	v_answer = float(v_value.norm().evalf())

	data['params']['position_x'] = latex(r[0])
	data['params']['position_y'] = latex(r[1])
	data['params']['position_z'] = latex(r[2])

	# for copyable inputs
	data['params']['rx'] = str(r[0])
	data['params']['ry'] = str(r[1])
	data['params']['rz'] = str(r[2])
	data['params']['t'] = t_value
	data['correct_answers']['v'] = v_answer

	return data