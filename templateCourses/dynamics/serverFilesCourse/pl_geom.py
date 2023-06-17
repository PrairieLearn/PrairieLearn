import numpy as np

def perp(v):
	"""v: numpy array of size (n,)
	   n: size of the array
	returns the counterclockwise orthogonal vector to v
	"""
	return np.array([-v[1], v[0], 0])

def boundingBox2D(points):
    xMin = points[0][0]
    xMax = points[0][0]
    yMin = points[0][1]
    yMax = points[0][1]
    for i in range(1, len(points)):
        xMin = min(xMin, points[i][0])
        xMax = max(xMax, points[i][0])
        yMin = min(yMin, points[i][1])
        yMax = max(yMax, points[i][1])
    
    bottomLeft = np.array([xMin, yMin, 0])
    bottomRight = np.array([xMax, yMin, 0])
    topLeft = np.array([xMin, yMax, 0])
    topRight = np.array([xMax, yMax, 0])
    center = np.array([(xMin + xMax)/2, (yMin + yMax)/2, 0])
    extent = np.array([xMax - xMin, yMax - yMin])
    
    return bottomLeft, bottomRight, topLeft, topRight, center, extent

def cross2DOut(v1, v2):
    return (v1[0] * v2[1] - v1[1]*v2[0])

def vector2DAtAngle(x):
    """x: angle measured from the x-axis, in radians
    returns unit vector of size (3,)"""
    return np.array([np.cos(x), np.sin(x), 0])

def angleOf(v):
    """v: vector of size (n,)
    returns the true angle of the vector with respect to the x-axis, in radians
    returns the adjusted angle for pl-drawing, in degrees"""
    trueAngle = np.arctan2(v[1], v[0])
    plAngle = 0

    if trueAngle < 0:
        plAngle = abs(trueAngle)
    else:
        plAngle = -trueAngle

    return trueAngle, np.degrees(plAngle)

def bboxTranslate(C, points, offsetx, offsety, width=30):
    translated_points = []
    """C: Center of the bounding box as a numpy array
    points: List of vectors to offset from the center
    offsetx: The x-offset from the top left corner, usually half the width of the figure
    offsety: The y-offset from the top left corner, usually half the height of the figure
    width: Width of the vector offset, default 30

    returns the 2D offset (corrected) points for pl-drawing"""

    for i in range(len(points)):
        x_translated = offsetx + width*(points[i][0] - C[0])
        y_translated = offsety - width*(points[i][1] - C[1])
        translated_points.append(np.array(([x_translated, y_translated, 0])))

    return translated_points

def fixedMod(value, modulus):
    return ((value % modulus) + modulus) % modulus

def angleDifferenceDeg(a1, a2):
    return min(fixedMod(a1 - a2, 360), fixedMod(a2 - a1, 360))

def linearInterp(x0, x1, alpha):
    """x0: first number
       x1: second number
       alpha: The propotion of x1 versus x0 (between 0 and 1)
    """
    return (1 - alpha) * x0 + alpha * x1

def linearDeinterp(x0, x1, x):
    """x0: first number
       x1: second number
       x: the value to be de-interpolated
    """
    return (x - x0)/(x1 - x0)

def linearMap(x0, x1, y0, y1, x):
    """x0: first number
       x1: second number
       y0: the image of x0
       y1: the image of x1
       x: the value to be mapped
       returns the value y that x maps to
    """
    return linearInterp(y0, y1, linearDeinterp(x0, x1, x))

def polarToRect(polar_vec):
    x = polar_vec[0] * np.cos(polar_vec[1])
    y = polar_vec[0] * np.sin(polar_vec[1])

    return np.array([x, y, 0])

def rectToPolar(rectangular_vec):
    r = np.sqrt(rectangular_vec[0]**2 + rectangular_vec[1]**2)
    theta = np.arctan2(rectangular_vec[1], rectangular_vec[0])

    return np.array([r, theta, 0])

def rotateAboutOrigin2D(v, theta):
    # Check if the array is 3D. If it's 2D, insert a 0 for the last element
    if np.shape(v)[0] != 3:
        v = np.insert(v, len(v), 0)

    # Reshape the array if it's (3,) for matrix multiplication
    if np.shape(v) != (3,1):
        v = v.reshape((3, 1))

    R = np.array([[np.cos(theta), -np.sin(theta), 0], [np.sin(theta), np.cos(theta), 0], [0, 0, 1]])

    # Return a reshaped rotated array
    return (R @ v).reshape(3,)

def angleFrom(vFrom, vTo):
    return np.arctan2(vTo[1], vTo[0]) - np.arctan2(vFrom[1], vFrom[0])
