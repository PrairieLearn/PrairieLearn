import numpy as np
from pl_geom import *
from pl_template import PL_angle

def rightAngle(O, v1, v2):
	"""
	O: origin of vectors v1, v2, in PL coordinates
	v1: first vector of size (3,)
	v2: second vector of size (3,)
	returns pl-drawing code to draw the right angle between them
	"""
	[v1_angle, v1PLangle] = angleOf(v1)
	[v2_angle, v2PLangle] = angleOf(v2)

	startLine1x = O[0] + 11*np.cos(v1_angle)
	startLine2x = O[0] + 11*np.cos(v2_angle)
	startLine1y = O[1] - 11*np.sin(v1_angle)
	startLine2y = O[1] - 11*np.sin(v2_angle)

	drawRightAngle = f'<pl-line x1={startLine1x} y1={startLine1y} angle={v2PLangle} width="11" stroke-width="1"></pl-line>\n\
					<pl-line x1={startLine2x} y1={startLine2y} angle={v1PLangle} width="11" stroke-width="1"></pl-line>'

	return drawRightAngle


def ground(P, en, width):
	"""
	P: Location of the ground's center, in PL coordinates as a list or np.array
	en: normal vector of the ground
	width: width of the ground
	returns the pl-drawing code to draw the ground
	NOTE: deprecated, still used in several questions. should be replaced with groundAtAngle()
	"""

	offsetx = 6
	offsety = 6

	if np.linalg.norm(en) != 0:
		en = en/np.linalg.norm(en)

	[en_angle, en_PL_angle] = angleOf(en)
	[et_angle, et_PL_angle] = angleOf(perp(en))

	linex1 = P[0] - width/2*np.cos(et_angle)
	liney1 = P[1] - width/2*np.sin(et_angle)

	linex2 = P[0] + width/2*np.cos(et_angle)
	liney2 = P[1] + width/2*np.sin(et_angle)

	rectx = P[0] - offsetx*np.sin(et_angle)
	recty = P[1] - offsety*np.cos(et_angle)

	drawGround = f'<pl-line x1={linex1} y1={liney1} x2={linex2} y2={liney2}></pl-line>\n<pl-rectangle x1={rectx} y1={recty} width={width} height="10" angle={et_PL_angle} stroke-width="0" color="#DCDCDC"></pl-rectangle>'

	return drawGround

def arcGround(C, radius, inside = True):
	"""C: Location of the arc's center, in PL coordinates
	   radius: Radius of the arc
	   inside: Whether to draw the ground inside, default True
	"""
	if inside:
		drawArcGround = f'<pl-circle x1={C[0]} y1={C[1]} radius={radius + 9} color="#DCDCDC" stroke-width="0"></pl-circle>\n<pl-circle x1={C[0]} y1={C[1]} radius={radius} color="#FFFFFF" stroke-width="2"></pl-circle>'
	else:
		drawArcGround = f'<pl-circle x1={C[0]} y1={C[1]} radius={radius + 9} color="#FFFFFF" stroke-width="2"></pl-circle>\n<pl-circle x1={C[0]} y1={C[1]} radius={radius + 7.5} color="#DCDCDC" stroke-width="0"></pl-circle>\n<pl-circle x1={C[0]} y1={C[1]} radius={radius} color="#FFFFFF" stroke-width="0"></pl-circle>'

	return drawArcGround

def groundAtAngle(P, angle, width):
	"""P: Location of the ground's center, in PL coordinates
	   angle: angle of ground, in degrees
	   width: width of the ground
	returns the pl-drawing code that draws ground at an angle. should be combined with ground() eventually"""

	angle_for_line = np.radians(angle)
	angle_for_rectangle = PL_angle(angle)

	linex1 = P[0] - width/2*np.cos(angle_for_line)
	liney1 = P[1] + width/2*np.sin(angle_for_line)

	linex2 = P[0] + width/2*np.cos(angle_for_line)
	liney2 = P[1] - width/2*np.sin(angle_for_line)

	rectx = P[0] + 6*np.sin(np.radians(angle))
	recty = P[1] + 5*np.cos(np.radians(angle))

	"""<pl-rectangle x1="224" y1="140" width="502" height="8" angle="-45" stroke-width="0" color="#DCDCDC"></pl-rectangle>"""

	drawAngleGround = f'<pl-line x1={linex1} y1={liney1} x2={linex2} y2={liney2}></pl-line><pl-rectangle x1={rectx} y1={recty} width={width} height="8" angle={angle_for_rectangle} stroke-width="0" color="#DCDCDC"></pl-rectangle>'

	return drawAngleGround

def arcArrow(C, start, end, radius, counterclockwise=True, offsetx = -15., offsety = -5., label="", color="#000000"):
	"""C: center of the arc, as a list
	   start: start angle in degrees
	   end: end angle in degrees
	   radius: radius of the arc
	   label: string label of the arc
	   returns the counterclockwise arc, instead of clockwise arc in pl-arc-dimensions by default
	   """
	start_angle = PL_angle(start)
	end_angle = PL_angle(end)

	label = "\\" + label if label != "" else ""

	if counterclockwise:
		drawArcArrow = f'<pl-arc-dimensions x1={C[0]} y1={C[1]} start-angle={end_angle} end-angle={start_angle} draw-start-arrow="true" draw-end-arrow="false" label="{label}" offsetx={offsetx} offsety={offsety} radius={radius} stroke-width="2" stroke-color={color}></pl-arc-dimensions>'
	else:
		drawArcArrow = f'<pl-arc-dimensions x1={C[0]} y1={C[1]} start-angle={end_angle} end-angle={start_angle} draw-start-arrow="false" draw-end-arrow="true" label="{label}" offsetx={offsetx} offsety={offsety} radius={radius} stroke-width="2" stroke-color={color}></pl-arc-dimensions>'

	return drawArcArrow