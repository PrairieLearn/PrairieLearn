import random

def generate(data):
	theta = random.choice([30, 45, 60, 120, 135, 150, 210, 225, 240, 300, 315, 330])

	if theta == 30:
		expr = random.choice(["\\hat{e}_r      =  \\frac{\\sqrt{3}}{2} \\hat\\imath + \\frac{1}{2}        \\hat\\jmath", \
			"\\hat{e}_\\theta = -\\frac{1}{2}        \\hat\\imath + \\frac{\\sqrt{3}}{2} \\hat\\jmath"])

	elif theta == 45:
		expr = random.choice(["\\hat{e}_r      =  \\frac{1}{\\sqrt{2}} \\hat\\imath + \\frac{1}{\\sqrt{2}} \\hat\\jmath", \
			"\\hat{e}_\\theta = -\\frac{1}{\\sqrt{2}} \\hat\\imath + \\frac{1}{\\sqrt{2}} \\hat\\jmath"])

	elif theta == 60:
		expr = random.choice(["\\hat{e}_r      =  \\frac{1}{2} \\hat\\imath + \\frac{\\sqrt{3}}{2} \\hat\\jmath", \
			"\\hat{e}_\\theta = -\\frac{\\sqrt{3}}{2} \\hat\\imath + \\frac{1}{2} \\hat\\jmath"])

	elif theta == 120:
		expr = random.choice(["\\hat{e}_r      = -\\frac{1}{2}        \\hat\\imath + \\frac{\\sqrt{3}}{2} \\hat\\jmath", \
			"\\hat{e}_\\theta = -\\frac{\\sqrt{3}}{2} \\hat\\imath - \\frac{1}{2}        \\hat\\jmath"])

	elif theta == 135:
		expr = random.choice(["\\hat{e}_r      = -\\frac{1}{\\sqrt{2}} \\hat\\imath + \\frac{1}{\\sqrt{2}} \\hat\\jmath", \
			"\\hat{e}_\\theta = -\\frac{1}{\\sqrt{2}} \\hat\\imath - \\frac{1}{\\sqrt{2}} \\hat\\jmath"])

	elif theta == 150:
		expr = random.choice(["\\hat{e}_r      = -\\frac{\\sqrt{3}}{2} \\hat\\imath + \\frac{1}{2}        \\hat\\jmath", \
			"\\hat{e}_\\theta = -\\frac{1}{2}        \\hat\\imath - \\frac{\\sqrt{3}}{2} \\hat\\jmath"])

	elif theta == 210:
		expr = random.choice(["\\hat{e}_r      = -\\frac{\\sqrt{3}}{2} \\hat\\imath - \\frac{1}{2}        \\hat\\jmath", \
			"\\hat{e}_\\theta =  \\frac{1}{2}        \\hat\\imath - \\frac{\\sqrt{3}}{2} \\hat\\jmath"])

	elif theta == 225:
		expr = random.choice(["\\hat{e}_r      = -\\frac{1}{\\sqrt{2}} \\hat\\imath - \\frac{1}{\\sqrt{2}} \\hat\\jmath", \
			"\\hat{e}_\\theta =  \\frac{1}{\\sqrt{2}} \\hat\\imath - \\frac{1}{\\sqrt{2}} \\hat\\jmath"])

	elif theta == 240:
		expr = random.choice(["\\hat{e}_r      = -\\frac{1}{2}        \\hat\\imath - \\frac{\\sqrt{3}}{2} \\hat\\jmath", \
			"\\hat{e}_\\theta =  \\frac{\\sqrt{3}}{2} \\hat\\imath - \\frac{1}{2}        \\hat\\jmath"])

	elif theta == 300:
		expr = random.choice(["\\hat{e}_r      =  \\frac{1}{2}        \\hat\\imath - \\frac{\\sqrt{3}}{2} \\hat\\jmath", \
			"\\hat{e}_\\theta =  \\frac{\\sqrt{3}}{2} \\hat\\imath + \\frac{1}{2}        \\hat\\jmath"])

	elif theta == 315:
		expr = random.choice(["\\hat{e}_r      =  \\frac{1}{\\sqrt{2}} \\hat\\imath - \\frac{1}{\\sqrt{2}} \\hat\\jmath", \
			"\\hat{e}_\\theta =  \\frac{1}{\\sqrt{2}} \\hat\\imath + \\frac{1}{\\sqrt{2}} \\hat\\jmath"])

	else:
		expr = random.choice(["\\hat{e}_r      =  \\frac{\\sqrt{3}}{2} \\hat\\imath - \\frac{1}{2}        \\hat\\jmath", \
			"\\hat{e}_\\theta =  \\frac{1}{2}        \\hat\\imath + \\frac{\\sqrt{3}}{2} \\hat\\jmath"])

	ans1 = "false"
	ans2 = "false"
	ans3 = "false"
	ans4 = "false"

	if theta < 90:
		quadrant = '1'
		ans1 = "true"

	elif theta > 90 and theta < 180:
		quadrant = '2'
		ans2 = "true"

	elif theta > 180 and theta < 270:
		quadrant = '3'
		ans3 = "true"

	else:
		quadrant = '4'
		ans4 = "true"

	data['params']['expr'] = expr
	data['params']['ans1'] = ans1
	data['params']['ans2'] = ans2
	data['params']['ans3'] = ans3
	data['params']['ans4'] = ans4

	return data
