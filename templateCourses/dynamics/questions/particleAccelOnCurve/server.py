import random
import numpy as np
from sympy import *
from matplotlib import pyplot as plt
import io

def generate(data):
	x = symbols('x')
	vx = random.choice([2, 4, 10])
	xFuncType = random.randint(0, 1)
	func_type = ["sin", "cos"][xFuncType]
	A = random.choice([-2, -1, 1, 2])
	if abs(A) == 2:
		B = random.choice([0.5, 1, 2])
	else:
		B = random.choice([1, 2])

	if np.random.choice([True, False], p=[0.75, 0.25]):
		Q = xFuncType
	else:
		Q = 1 - xFuncType

	xCoeff = random.randint(1, 4 * B - 1)/B + (1 - Q)/(2* B)

	if func_type == 'cos':
		y = A*cos(B*x)
	else:
		y = A*sin(B*x)

	yPos = y.subs(x, xCoeff * pi)

	if abs(yPos) < 0.01:
		curvePos = "middle"
	elif yPos > 0:
		curvePos = "highest"
	else:
		curvePos = "lowest"

	yprime = diff(y, x)

	ydp = diff(yprime, x)

	ay = ydp.subs(x, xCoeff * pi) * vx**2

	data['params']['ylatex'] = latex(y)
	data['params']['y'] = str(y)
	data['params']['vx'] = vx
	data['params']['xCoeff'] = xCoeff
	data['params']['A'] = A
	data['params']['B'] = B
	data['params']['func_type'] = func_type
	data['params']['curvePos'] = curvePos
	data['params']['vDir'] = random.choice(['left', 'right'])

	data['correct_answers']['ay'] = float(ay)

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

	x_value = float(data['params']['xCoeff'] * pi)

	y_value = y.subs(x, x_value)

	xMin = 0
	xMax = 4*np.pi

	yMax = 2
	yMin = -2

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
	ax.set_ylabel('y', loc ='top', size='xx-large')
	ax.set_xlabel('x', loc ='right', size='xx-large')
	ax.set_xticks(np.arange(np.pi, xMax + np.pi/2, step=np.pi))
	ax.set_xticklabels(['π', '2π', '3π', '4π'], size = 'x-large')
	ax.set_yticks(np.arange(-2, 3, step=1))
	ax.set_yticklabels(['-2', '-1', '0', '1', '2'], size='x-large')

	buf = io.BytesIO()
	fig.savefig(buf, format='png')

	return buf
