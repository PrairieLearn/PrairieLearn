import random
import numpy as np
from pl_random import *
from pl_template import *
from pl_geom import *
from pl_draw import *
import prairielearn as pl

def generate(data):
	width = random.randint(2, 3)
	rhos = NChoice(3, [i for i in range(1, 10)])
	length = random.randint(15, 18)
	l1 = random.randint(3, 6)
	l2 = random.randint(3, 6)
	l3 = length - l1 - l2
	lengths = [l1, l2, l3]
	random.shuffle(lengths)

	rho1 = rhos[0]
	rho2 = rhos[1]
	rho3 = rhos[2]
	l1 = lengths[0]
	l2 = lengths[1]
	l3 = lengths[2]

	angle = random.choice([-1, 1]) * (randIntNonZero(1, 3)/18 * np.pi + random.choice([0, np.pi]))

	angle_PL = np.degrees(PL_angle(angle))

	m1 = rho1 * width * l1
	m2 = rho2 * width * l2
	m3 = rho3 * width * l3
	m = m1 + m2 + m3

	C1 = np.array([l1/2, width/2, 0])
	C2 = np.array([l1 + l2/2, width/2 , 0])
	C3 = np.array([l1 + l2 + l3/2, width/2, 0])
	C = 1/m * (m1 * C1 + m2 * C2 + m3*C3)

	I1 = 1/12 * m1 * (width**2 + l1**2)
	I2 = 1/12 * m2 * (width**2 + l2**2)
	I3 = 1/12 * m3 * (width**2 + l3**2)

	IC = I1 + m1 * np.dot(C - C1, C - C1) + I2 + m2*np.dot(C - C2, C - C2) + I3 + m3*np.dot(C - C3, C - C3)

	data['params']['l1'] = float(l1)
	data['params']['l2'] = float(l2)
	data['params']['l3'] = float(l3)
	data['params']['rho1'] = float(rho1)
	data['params']['rho2'] = float(rho2)
	data['params']['rho3'] = float(rho3)
	data['params']['w'] = float(width)

	# pl-variable-output
	pl_var_output_list = []
	for i in range(len(lengths)):
		params_name_l = "l" + f'{i+1}'
		params_name_rho = "rho" + f'{i+1}'
		varoutput_l = f'<variable params-name="{params_name_l}">{params_name_l}</variable>'
		varoutput_rho = f'<variable params-name="{params_name_rho}">{params_name_rho}</variable>'
		pl_var_output_list.append(varoutput_l)
		pl_var_output_list.append(varoutput_rho)

	pl_var_output = "\n".join(pl_var_output_list)
	data['params']['pl_var_output'] = pl_var_output

	# pl-drawing

	u1 = vector2DAtAngle(angle)
	u2 = perp(u1)

	x1 = -length/2 + l1/2
	x2 = -length/2 + l1 + l2/2
	x3 = -length/2 + l1 + l2 + l3/2

	R1c = x1 * u1 
	R2c = x2 * u1
	R3c = x3 * u1

	points = [R1c, R2c, R3c]

	translated_centers = bboxTranslate(np.zeros(3), points, 200, 125, 17)

	# pl-dimensions
	g = 0.5
	P = -length/2 * u1 + (-width/2 - g)*u2

	points = [P, P + l1*u1, P + (l1 + l2)*u1, P + (l1 + l2 + l3)*u1, (-length/2 - g)*u1 + width/2 * u2, (-length/2 - g)*u1 - width/2 * u2]

	translated_measurements = bboxTranslate(np.zeros(3), points, 200, 125, 17)

	drawList = []

	# For color-density shading
	rhoMin = min(rho1, rho2, rho3)
	rhoMax = max(rho1, rho2, rho3)

	c1 = int(linearMap(rhoMin, rhoMax, 240, 200, rho1))
	c2 = int(linearMap(rhoMin, rhoMax, 240, 200, rho2))
	c3 = int(linearMap(rhoMin, rhoMax, 240, 200, rho3))

	c = [c1, c2, c3]

	for i in range(len(lengths)):
		drawRectangle = f'<pl-rectangle x1={translated_centers[i][0]} y1={translated_centers[i][1]} width={17*lengths[i]} height={17*width} angle={angle_PL} color={rgb_to_hex((c[i], c[i], c[i]))} stroke-width=2.0></pl-rectangle>'
		currentLength = "\\\\ell_" + f'{i+1}'
		drawDimension = f'<pl-dimensions x1={translated_measurements[i][0]} y1={translated_measurements[i][1]} x2={translated_measurements[i+1][0]} y2={translated_measurements[i+1][1]} label="{currentLength}" stroke-width=0.7></pl-dimensions>'
		drawList.append(drawRectangle)
		drawList.append(drawDimension)

	drawCode = "\n".join(drawList)

	drawWidth = f'<pl-dimensions x1={translated_measurements[-2][0]} y1={translated_measurements[-2][1]} x2={translated_measurements[-1][0]} y2={translated_measurements[-1][1]} label="w" stroke-width=0.7></pl-dimensions>'

	drawCode += drawWidth

	data['params']['drawCode'] = drawCode

	data['correct_answers']['IC'] = IC 
	return data