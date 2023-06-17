import random
import numpy as np
from pl_random import *
from pl_template import *
from pl_geom import *
from pl_draw import *
import prairielearn as pl

def generate(data):
	nGears = 4

	radiusChoices = [random.randint(5, 6), \
	random.randint(6, 7), \
	random.randint(7, 8), \
	random.randint(8, 9)]

	radii = NChoice(nGears, radiusChoices)

	angleChoices = [0, 30, -30, random.choice([-1, 1]) * 60]
	angles = NChoice(nGears - 1, angleChoices)

	radiusExpList = []

	for i in range(nGears):
		if i != nGears - 1:
			radiusExp = "$r_" + f'{i+1} = ' + f'{radii[i]}' + '\\rm\\ m$'
		else:
			radiusExp = "and $r_" + f'{i + 1} = ' + f'{radii[i]}' + '\\rm\\ m$'

		radiusExpList.append(radiusExp)

	radiusExps = ", ".join(radiusExpList)

	nums = NChoice(4, [1, 2, 3, 4])
	givenANum = nums[0]
	givenAngNum = nums[1]
	givenDirNum = nums[2]
	ansNum = nums[3]
	PNum = givenANum

	givenChoice = random.choice(["omega", "alpha"])
	givenAngValue = random.randint(2, 9)

	if givenChoice == "omega":
		givenAngDescription = "angular velocity magnitude"
		givenAngVar = "\\omega_" + f'{givenAngNum}'
		givenAngUnits = "rad/s"
		ansDescription = "angular acceleration"
		ansVar = "\\vec\\alpha_" + f'{ansNum}'
		ansUnits = "rad/s^2"
		minAMag = np.ceil((radii[givenAngNum - 1] * givenAngValue)**2 / radii[givenANum - 1])

	else:
		givenAngDescription = "angular acceleration magnitude"
		givenAngVar = "\\alpha_" + f'{givenAngNum}'
		givenAngUnits = "rad/s^2"
		ansDescription = "angular velocity"
		ansVar = "\\vec\\omega_" + f'{ansNum}'
		ansUnits = "rad/s"
		minAMag = radii[givenAngNum - 1] * abs(givenAngValue)

	givenAMag = random.randint(minAMag + 2, 2 * (minAMag + 2))

	PAngle = random.randint(0, 23)/24 * 2 * np.pi

	givenDirValue = random.choice([-1, 1])
	if givenDirValue == 1:
		givenDirDescription = "counterclockwise"
	else:
		givenDirDescription = "clockwise"

	givenDirRateChange = random.choice(["an increasing", "a decreasing"])

	if givenDirRateChange == "an increasing":
		aDir = givenDirValue*1
	else:
		aDir = givenDirValue*-1

	givenAR = radii[givenANum - 1]
	givenAngR = radii[givenAngNum - 1]
	givenDirR = radii[givenDirNum - 1]
	ansR = radii[ansNum - 1]
	relDir = 1 - (abs(ansNum - givenDirNum) % 2) * 2

	if givenChoice == "omega":
		aOmega = givenAngValue * givenAngR/givenAR
		aAlpha = np.sqrt((givenAMag/givenAR)**2 - aOmega**4)
		ans = aAlpha * givenAR/ansR * aDir * relDir
	else:
		aAlpha = givenAngValue * givenAngR/givenAR
		aOmega = ((givenAMag/givenAR)**2 - aAlpha**2)**(1/4)
		ans = aOmega * givenAR/ansR * givenDirValue * relDir

	# for pl-variable-output
	data['params']['r1'] = float(radii[0])
	data['params']['r2'] = float(radii[1])
	data['params']['r3'] = float(radii[2])
	data['params']['r4'] = float(radii[3])

	givenVar = givenChoice + f'{givenAngNum}' + 'Mag'
	data['params']['givenVar'] = givenVar
	data['params'][givenVar] = givenAngValue

	data['params']['radiusExps'] = radiusExps
	data['params']['PNum'] = PNum
	data['params']['givenAMag'] = float(givenAMag)
	data['params']['givenAngNum'] = givenAngNum
	data['params']['givenAngDescription'] = givenAngDescription
	data['params']['givenAngVar'] = givenAngVar
	data['params']['givenAngValue'] = givenAngValue
	data['params']['givenAngUnits'] = givenAngUnits
	data['params']['givenDirRateChange'] = givenDirRateChange
	data['params']['givenDirDescription'] = givenDirDescription
	data['params']['givenDirNum'] = givenDirNum

	pl_var_output_list = []

	for i in range(nGears):
		params_name = "r" + f'{i + 1}'
		varoutput = f'<variable params-name="{params_name}">{params_name}</variable>'
		pl_var_output_list.append(varoutput)

	pl_var_output = "".join(pl_var_output_list)

	data['params']['pl_var_output'] = pl_var_output

	# for pl-drawing
	centers = [np.zeros(3)]
	direction = random.choice([-1, 1])
	for i in range(1, len(radii)):
		r0 = radii[i-1]
		r1 = radii[i]
		angle = angles[i - 1]
		if direction < 0:
			angle += 180
		centers.append(centers[i - 1] + vector2DAtAngle(np.radians(angle))*(r0 + r1))

	P = centers[PNum - 1] + vector2DAtAngle(PAngle) * radii[PNum - 1]

	points = []
	for i in range(len(radii)):
		points.append(centers[i] + np.array([radii[i], 0, 0]))
		points.append(centers[i] + np.array([-radii[i], 0, 0]))
		points.append(centers[i] + np.array([0, radii[i], 0]))
		points.append(centers[i] + np.array([0, -radii[i], 0]))

	[bottomLeft, bottomRight, topLeft, topRight, center, extent] = boundingBox2D(points)

	C = center

	translated_points = bboxTranslate(C, centers, 300, 200, 8)

	Px = 300 + 8*(P[0] - C[0])
	Py = 200 - 8*(P[1] - C[1])

	data['params']['Px'] = Px
	data['params']['Py'] = Py

	drawList = []
	for i in range(nGears):
		drawCircle = f'<pl-circle x1={translated_points[i][0]} y1={translated_points[i][1]} color="#FFFFFF" radius={8*radii[i]} stroke-width=2></pl-circle>'
		gearNum = f'{i+1}'
		drawPoint = f'<pl-point x1={translated_points[i][0]} y1={translated_points[i][1]} label="{"C_" + gearNum}" radius=2.2></pl-point>'
		drawList.append(drawCircle)
		drawList.append(drawPoint)

	drawCode = "\n".join(drawList)

	data['params']['drawCode'] = drawCode

	data['params']['ansDescription'] = ansDescription
	data['params']['ansVar'] = ansVar
	data['params']['ansNum'] = ansNum
	data['correct_answers']['ans'] = ans
	data['params']['ansUnits'] = ansUnits

	return data