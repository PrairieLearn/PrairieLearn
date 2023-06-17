import random
import numpy as np
from sympy import *
from pl_random import *
from pl_template import *
from pl_geom import *

def generate(data):
	t = symbols('t')

	int_list = [-3, -2, -1, 1, 2, 3]

	basis_choice = random.choice(["\\hat{e}_r", "\\hat{e}_{\\theta}"])

	if basis_choice == "\\hat{e}_r":
		num = random.choice([True, False])
		if num:
			ercomp = random.choice(int_list)
			ethcomp = random.choice(int_list)

			x0 = random.choice([-1, 1]) * random.randint(10, 15)
			y0 = random.choice([-1, 1]) * random.randint(10, 15)
			t_value = random.randint(2, 3)
			r0 = sqrt(x0**2 + y0**2)
			theta0 = np.arctan2(y0, x0)

			rdot = ercomp
			r_expr = integrate(rdot, t)

			C1 = float(r0 - float(r_expr.subs(t, 0).evalf()))

			r = r_expr + C1

			C2 = float(theta0 - ethcomp/ercomp * log(C1))

			theta_t_value = ethcomp/ercomp * log(ercomp*t_value + C1) + C2

			x = r.subs(t, t_value) * cos(theta_t_value)
			y = r.subs(t, t_value) * sin(theta_t_value)
		else:
			ercomp = random.choice([randTrig(t), randPoly(t, 2)])
			ethcomp = 0

			x0 = random.choice([-1, 1]) * random.randint(6, 12)
			y0 = random.choice([-1, 1]) * random.randint(6, 12)
			t_value = random.randint(2, 5)
			r0 = sqrt(x0**2 + y0**2)
			theta0 = np.arctan2(y0, x0)

			rdot = ercomp
			r_expr = integrate(rdot, t)
			C = float(r0 - float(r_expr.subs(t, 0).evalf()))
			r = r_expr + C

			theta = theta0

			x = r.subs(t, t_value) * cos(theta)
			y = r.subs(t, t_value) * sin(theta)

			ercomp = f'({latex(ercomp)})'
	else:
		num = random.choice([True, False])
		if num:
			ercomp = random.choice(int_list)
			ethcomp = random.choice(int_list)
			x0 = random.choice([-1, 1]) * random.randint(10, 15)
			y0 = random.choice([-1, 1]) * random.randint(10, 15)
			t_value = random.randint(2, 3)
			r0 = sqrt(x0**2 + y0**2)
			theta0 = np.arctan2(y0, x0)

			rdot = ercomp
			r_expr = integrate(rdot, t)

			C1 = float(r0 - float(r_expr.subs(t, 0).evalf()))

			r = r_expr + C1

			C2 = float(theta0 - ethcomp/ercomp * log(C1))

			theta_t_value = ethcomp/ercomp * log(ercomp*t_value + C1) + C2

			x = r.subs(t, t_value) * cos(theta_t_value)
			y = r.subs(t, t_value) * sin(theta_t_value)
		else:
			ercomp = 0
			ethcomp = random.choice([randTrig(t), randPoly(t, 2), randExp(t)])

			x0 = random.choice([-1, 1]) * random.randint(2, 5)
			y0 = random.choice([-1, 1]) * random.randint(2, 5)
			t_value = random.randint(2, 5)
			r0 = sqrt(x0**2 + y0**2)
			theta0 = np.arctan2(y0, x0)

			r = r0

			thetadot = ethcomp/r

			theta_expr = integrate(thetadot, t)

			C = float(theta0 - float(theta_expr.subs(t,0).evalf()))

			theta = theta_expr + C

			x = r * cos(theta.subs(t, t_value))
			y = r * sin(theta.subs(t, t_value))

			ethcomp = f'({latex(ethcomp)})'

	v = np.array([ercomp, ethcomp, 0])

	data['params']['v'] = polarVector(v)
	data['params']['x0'] = float(x0)
	data['params']['y0'] = float(y0)
	data['params']['t'] = t_value

	data['correct_answers']['x'] = float(x)
	data['correct_answers']['y'] = float(y)

	return data
