"""Python implementation of
Algorithm for Automatically Fitting Digitized Curves
by Philip J. Schneider
"Graphics Gems", Academic Press, 1990
Based on https://github.com/volkerp/fitCurves
"""

from numpy import array, dot, zeros
from numpy.linalg import norm


# Fit one (or more) Bezier curves to a set of points
def fitCurve(rawPoints, maxError):
    points = array(rawPoints)
    left_tangent = normalize(points[1] - points[0])
    right_tangent = normalize(points[-2] - points[-1])
    fit = fitCubic(points, left_tangent, right_tangent, maxError)
    return [fit[0][0].tolist()] + [
        point.tolist() for curve in fit for point in curve[1:]
    ]


def q(ctrlPoly, t):
    return (
        (1.0 - t) ** 3 * ctrlPoly[0]
        + 3 * (1.0 - t) ** 2 * t * ctrlPoly[1]
        + 3 * (1.0 - t) * t**2 * ctrlPoly[2]
        + t**3 * ctrlPoly[3]
    )


# evaluates cubic bezier first derivative at t, return point
def qprime(ctrlPoly, t):
    return (
        3 * (1.0 - t) ** 2 * (ctrlPoly[1] - ctrlPoly[0])
        + 6 * (1.0 - t) * t * (ctrlPoly[2] - ctrlPoly[1])
        + 3 * t**2 * (ctrlPoly[3] - ctrlPoly[2])
    )


# evaluates cubic bezier second derivative at t, return point
def qprimeprime(ctrlPoly, t):
    return 6 * (1.0 - t) * (ctrlPoly[2] - 2 * ctrlPoly[1] + ctrlPoly[0]) + 6 * (t) * (
        ctrlPoly[3] - 2 * ctrlPoly[2] + ctrlPoly[1]
    )


def fitCubic(points, leftTangent, rightTangent, error):
    # Use heuristic if region only has two points in it
    if len(points) == 2:
        dist = norm(points[0] - points[1]) / 3.0
        bez_curve = [
            points[0],
            points[0] + leftTangent * dist,
            points[1] + rightTangent * dist,
            points[1],
        ]
        return [bez_curve]

    # Parameterize points, and attempt to fit curve
    u = chordLengthParameterize(points)
    bez_curve = generateBezier(points, u, leftTangent, rightTangent)
    # Find max deviation of points to fitted curve
    max_error, split_point = computeMaxError(points, bez_curve, u)
    if max_error < error:
        return [bez_curve]

    # If error not too large, try some reparameterization and iteration
    if max_error < error**2:
        for _ in range(20):
            u_prime = reparameterize(bez_curve, points, u)
            bez_curve = generateBezier(points, u_prime, leftTangent, rightTangent)
            max_error, split_point = computeMaxError(points, bez_curve, u_prime)
            if max_error < error:
                return [bez_curve]
            u = u_prime

    # Fitting failed -- split at max error point and fit recursively
    beziers = []
    center_tangent = normalize(points[split_point - 1] - points[split_point + 1])
    beziers += fitCubic(points[: split_point + 1], leftTangent, center_tangent, error)
    beziers += fitCubic(points[split_point:], -center_tangent, rightTangent, error)

    return beziers


def generateBezier(points, parameters, leftTangent, rightTangent):
    bez_curve = [points[0], None, None, points[-1]]

    # compute the A's
    a = zeros((len(parameters), 2, 2))
    for i, u in enumerate(parameters):
        a[i][0] = leftTangent * 3 * (1 - u) ** 2 * u
        a[i][1] = rightTangent * 3 * (1 - u) * u**2

    # Create the C and X matrices
    c = zeros((2, 2))
    x = zeros(2)

    for i, (point, u) in enumerate(zip(points, parameters, strict=False)):
        c[0][0] += dot(a[i][0], a[i][0])
        c[0][1] += dot(a[i][0], a[i][1])
        c[1][0] += dot(a[i][0], a[i][1])
        c[1][1] += dot(a[i][1], a[i][1])

        tmp = point - q([points[0], points[0], points[-1], points[-1]], u)

        x[0] += dot(a[i][0], tmp)
        x[1] += dot(a[i][1], tmp)

    # Compute the determinants of C and X
    det_c0_c1 = c[0][0] * c[1][1] - c[1][0] * c[0][1]
    det_c0_x = c[0][0] * x[1] - c[1][0] * x[0]
    det_x_c1 = x[0] * c[1][1] - x[1] * c[0][1]

    # Finally, derive alpha values
    alpha_l = 0.0 if det_c0_c1 == 0 else det_x_c1 / det_c0_c1
    alpha_r = 0.0 if det_c0_c1 == 0 else det_c0_x / det_c0_c1

    # If alpha negative, use the Wu/Barsky heuristic (see text) */
    # (if alpha is 0, you get coincident control points that lead to
    # divide by zero in any subsequent NewtonRaphsonRootFind() call. */
    seg_length = norm(points[0] - points[-1])
    epsilon = 1.0e-6 * seg_length
    if alpha_l < epsilon or alpha_r < epsilon:
        # fall back on standard (probably inaccurate) formula, and subdivide further if needed.
        bez_curve[1] = bez_curve[0] + leftTangent * (seg_length / 3.0)
        bez_curve[2] = bez_curve[3] + rightTangent * (seg_length / 3.0)

    else:
        # First and last control points of the Bezier curve are
        # positioned exactly at the first and last data points
        # Control points 1 and 2 are positioned an alpha distance out
        # on the tangent vectors, left and right, respectively
        bez_curve[1] = bez_curve[0] + leftTangent * alpha_l
        bez_curve[2] = bez_curve[3] + rightTangent * alpha_r

    return bez_curve


def reparameterize(bezier, points, parameters):
    return [
        newtonRaphsonRootFind(bezier, point, u)
        for point, u in zip(points, parameters, strict=False)
    ]


def newtonRaphsonRootFind(bez, point, u):
    """
    Newton's root finding algorithm calculates f(x)=0 by reiterating
    x_n+1 = x_n - f(x_n)/f'(x_n)

    We are trying to find curve parameter u for some point p that minimizes
    the distance from that point to the curve. Distance point to curve is d=q(u)-p.
    At minimum distance the point is perpendicular to the curve.
    We are solving
    f = q(u)-p * q'(u) = 0
    with
    f' = q'(u) * q'(u) + q(u)-p * q''(u)

    gives
    u_n+1 = u_n - |q(u_n)-p * q'(u_n)| / |q'(u_n)**2 + q(u_n)-p * q''(u_n)|
    """
    d = q(bez, u) - point
    numerator = (d * qprime(bez, u)).sum()
    denominator = (qprime(bez, u) ** 2 + d * qprimeprime(bez, u)).sum()

    if denominator == 0.0:
        return u
    else:
        return u - numerator / denominator


def chordLengthParameterize(points):
    u = [0.0]
    for i in range(1, len(points)):
        u.append(u[i - 1] + norm(points[i] - points[i - 1]))

    for i, _ in enumerate(u):
        u[i] /= u[-1]

    return u


def computeMaxError(points, bez, parameters):
    max_dist = 0.0
    split_point = len(points) / 2
    for i, (point, u) in enumerate(zip(points, parameters, strict=False)):
        dist = norm(q(bez, u) - point) ** 2
        if dist > max_dist:
            max_dist = dist
            split_point = i

    return max_dist, split_point


def normalize(v):
    return v / norm(v)
