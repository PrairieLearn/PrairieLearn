import random
import numpy as np
from sympy import *
from matplotlib import pyplot as plt
import io

def generate(data):
	x = symbols('x')
	m = random.randint(3, 9)
	g = -9.8
	xFuncType = random.randint(0, 1)
	# Create a function y = Acos(Bx)
	func_type = ["sin", "cos"][xFuncType]
	A = random.choice([-1, 1]) * random.randint(1, 4)
	B = int(random.randint(3,6)/2)
	x_value = random.randint(2, 12)
	v = random.randint(1, 4)
	vdir = random.choice([1, -1])
	sddotMag = random.randint(1, 5)
	sddotDir = random.choice([1, -1])

	if func_type == 'sin':
		y = A*sin(B*x)
	else:
		y = A*cos(B*x)

	W = Matrix([0, m*g])

	yp = diff(y, x).subs(x, x_value)
	ydp = diff(y, x, 2).subs(x, x_value)

	rho = (1 + yp**2)**(3/2)/abs(float(ydp))

	et = Matrix([1, yp])/Matrix([1, yp]).norm()
	en = Matrix([-et[1], et[0]]) * np.sign(ydp)
	et = vdir * et

	a = sddotMag*sddotDir*et + v**2/rho * en

	Fw = m*a - W

	data['params']['ylatex'] = latex(y)
	data['params']['y'] = str(y)
	data['params']['A'] = A
	data['params']['B'] = B
	data['params']['func_type'] = func_type
	data['params']['x_value'] = x_value
	data['params']['m'] = m
	data['params']['v'] = v

	if vdir == -1:
		data['params']['vdir'] = 'left'
	else:
		data['params']['vdir'] = 'right'

	if sddotDir == -1:
		data['params']['sddotDir'] = 'decreasing'
	else:
		data['params']['sddotDir'] = 'increasing'


	data['params']['sddotMag'] = sddotMag

	data['correct_answers']['Fwx'] = float(Fw[0])
	data['correct_answers']['Fwy'] = float(Fw[1])

	return data

def file(data):
	x = symbols('x')

	A = data['params']['A']
	B = data['params']['B']

	func_type = data['params']['func_type']

	if func_type == 'sin':
		y = A*sin(B*x)
	else:
		y = A*cos(B*x)

	x_value = data['params']['x_value']

	y_value = y.subs(x, x_value)

	xMin = 0
	xMax = 4*np.pi

	yMax = 3
	yMin = -3

	t = np.linspace(xMin, xMax, 100)
	x_axis = np.zeros(len(t))
	y_axis = np.zeros(len(t))

	for i in range(len(t)):
		x_axis[i] = t[i]
		y_axis[i] = y.subs(x, t[i])

	fig, ax = plt.subplots(figsize=(10,5))
	ax.plot(x_axis, y_axis, 'b-', linewidth=2)
	ax.scatter(x_value, y_value, c='k', linewidth=3)
	ax.spines['bottom'].set_position(('data',0))
	ax.spines['top'].set_visible(False)
	ax.spines['right'].set_visible(False)
	ax.spines['left'].set_position(('data',0))
	ax.set_ylabel('y', loc ='top', size='xx-large', rotation="horizontal")
	ax.set_xlabel('x', loc ='right', size='xx-large')
	ax.set_xticks(np.arange(np.pi, xMax + np.pi, step=np.pi))
	ax.set_xticklabels(['π', '2π', '3π', '4π'], size = 'x-large')
	ax.set_yticks(np.arange(-3, 4, step=1))
	ax.set_yticklabels(['-3', '-2', '-1', '0', '1', '2', '3'], size='x-large')

	buf = io.BytesIO()
	fig.savefig(buf, format='png')

	return buf
