import numpy as np
import random
from pl_random import *
from pl_template import *
import prairielearn as pl

def generate(data):
	omega = np.array([0, 0, randIntNonZero(-4, 4)])
	r = randIntNonZeroArray(2, -5, 5)

	quantity_list = ["\\vec{v}", "\\vec{a}"]
	v_expr_list = ["\\vec\\omega \\times \\vec{r}", "\\omega \\vec{r}^\\perp"]
	a_expr_list = ["\\vec\\omega \\times (\\vec\\omega \\times \\vec{r})", "-\\omega^2 \\vec{r}"]

	quantity = random.choice(quantity_list)

	if quantity == "\\vec{v}":
		expr = random.choice(v_expr_list)
		v = np.cross(omega, r)
		data['correct_answers']['ansValue1'] = float(v[0])
		data['correct_answers']['ansValue2'] = float(v[1])
		data['correct_answers']['ansValue3'] = float(v[2])
		data['params']['units'] = "{\\rm\\ m/s}"
	else:
		expr = random.choice(a_expr_list)
		a = np.cross(omega,np.cross(omega,r))
		data['correct_answers']['ansValue1'] = float(a[0])
		data['correct_answers']['ansValue2'] = float(a[1])
		data['correct_answers']['ansValue3'] = float(a[2])
		data['params']['units'] = "{\\rm\\ m/s^2}"

	data['params']['quantity'] = quantity
	data['params']['expr'] = expr
	data['params']['omega'] = float(omega[2])
	data['params']['r_vec'] = cartesianVector(r)
	data['params']['r'] = pl.to_json(r)

	return data
