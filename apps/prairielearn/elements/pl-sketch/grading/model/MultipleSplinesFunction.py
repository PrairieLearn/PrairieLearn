import math

import numpy as np

from grading.utils import collapse_ranges

from .MultiFunction import MultiFunction
from .SplineFunction import SplineFunction


# Minor Helper Functions
def lesser(a, b):
    return a <= b


def greater(a, b):
    return a >= b


def lesser_or_equal(a, b, delta=0):
    d = delta * math.tan(math.pi / 12)
    if a <= b:
        return 0
    if a <= b + d:
        return 0.5
    else:
        return 1


def greater_or_equal(a, b, delta=0):
    d = delta * math.tan(math.pi / 12)
    if a >= b:
        return 0
    if a >= b - d:
        return 0.5
    else:
        return 1


class MultipleSplinesFunction(MultiFunction):  # noqa: PLR0904
    def __init__(self, xaxis, yaxis, path_info=[], functions=[], tolerance=dict()):
        super().__init__(
            xaxis, yaxis, path_info=path_info, functions=functions, tolerance=tolerance
        )
        self.set_default_tolerance("gap", 40)  # allow gaps up to x pixels in size
        self.set_default_tolerance(
            "angle", 10
        )  # x degrees allowed for angle difference
        self.set_default_tolerance(
            "domain", path_info["grader"]["tolerance"]
        )  # allows x pixels outside of domains #25 default, used in range_empty
        self.set_default_tolerance(
            "approach angle", 45 * math.radians(1)
        )  # to be used for asymptotes. not in use at the moment
        self.set_default_tolerance(
            "extrema", 20
        )  # considers values within 20 pixels for extrema checks
        self.set_default_tolerance("curve_failure", 1)

        self.set_default_tolerance("inc_dec_failure", 2)

    def create_from_path_info(self, path_info):
        self.functions = []
        xvals = []
        toolid = path_info["grader"]["currentTool"]
        submission_data = path_info["submission"]["gradeable"][toolid]  # CHECK
        for i in range(len(submission_data)):
            if "spline" in submission_data[i]:
                spline = SplineFunction(
                    self.xaxis, self.yaxis, submission_data[i]["spline"]
                )
                self.functions.append(spline)
                xvals += spline.get_domain()

        if len(xvals) == 0:
            self.domain = [[None, None]]
        else:
            self.domain = collapse_ranges(xvals)

    # Grader Functions ###
    def get_domain(self):
        """Returns the domain of the function within the bounds of the graph. Used by defined-in
        and undefined-in graders.
        """
        return self.domain

    def is_increasing_between(self, xmin, xmax, numPoints=10, failureTolerance=None):
        """Return whether the function is increasing in the range xmin to xmax.

        Args:
            xmin: the minimum x-axis value of the range to test.
            xmax: the maximum x-axis value of the range to test.
            numPoints(default: 10): the number of points to test along the range.
            failureTolerance(default: None): the number of pairwise point increase
                                          comparisons that can fail before the test
                                          fails. If None give, default constant
                                          'inc_dec_failure' is used.

        Returns:
            bool:
            true if all sequential pairs of points have increasing values within tolerances
            for the range xmin to xmax, otherwise false.
        """
        if failureTolerance is None:
            failureTolerance = self.tolerance["inc_dec_failure"]

        if self.does_not_exist_between(xmin, xmax, tolerance=5):
            if self.debug:
                self.debugger.add(f"No values found within range [{xmin},{xmax}].")
            return "ndef"

        [xleft, xright] = self.get_between_vals(xmin, xmax)
        if xleft > xright:
            if self.debug:
                self.debugger.add(f"No values found within range [{xmin},{xmax}].")
            return "ndef"
        xvals, yvals, delta = self.get_sample_points(numPoints, xleft, xright)
        yvals = [y for y in yvals if (self.within_y_range(y))]  # ACCOUNT FOR OFF GRAPH
        if len(yvals) < 2:
            return False

        if self.debug:
            self.debugger.var1 = 0  # keep track of iterations
            self.debugger.var2 = []  # keep track of which iterations failed
            self.debugger.var3 = xvals  # for later reference

        return self.always_comparer_at_points(
            lesser_or_equal, yvals, delta, failureTolerance
        )

    def is_decreasing_between(self, xmin, xmax, numPoints=10, failureTolerance=None):
        """Return whether the function is decreasing in the range xmin to xmax.

        Args:
            xmin: the minimum x-axis value of the range to test.
            xmax: the maximum x-axis value of the range to test.
            numPoints(default: 10): the number of points to test along the range.
            failureTolerance(default: None): the number of pairwise point decrease
                                          comparisons that can fail before the test
                                          fails. If None give, default constant
                                          'inc_dec_failure' is used.

        Returns:
            bool:
            true if all sequential pairs of points have decreasing values within tolerances
            for the range xmin to xmax, otherwise false.
        """
        if failureTolerance is None:
            failureTolerance = self.tolerance["inc_dec_failure"]

        if self.does_not_exist_between(xmin, xmax, tolerance=5):
            if self.debug:
                self.debugger.add(f"No values found within range [{xmin},{xmax}].")
            return "ndef"

        [xleft, xright] = self.get_between_vals(xmin, xmax)
        if xleft > xright:
            if self.debug:
                self.debugger.add(f"No values found within range [{xmin},{xmax}].")
            return "ndef"
        xvals, yvals, delta = self.get_sample_points(numPoints, xleft, xright)
        yvals = [y for y in yvals if (self.within_y_range(y))]  # ACCOUNT FOR OFF GRAPH
        if len(yvals) < 2:
            return False

        if self.debug:
            self.debugger.var1 = 0  # keep track of iterations
            self.debugger.var2 = []  # keep track of which iterations failed
            self.debugger.var3 = xvals  # for later reference

        return self.always_comparer_at_points(
            greater_or_equal, yvals, delta, failureTolerance
        )

    def has_positive_curvature_between(
        self, xmin, xmax, numSegments=5, failureTolerance=None
    ):
        """Return whether the function has positive curvature in the range xmin to xmax.

        Args:
            xmin: the minimum x-axis value of the range to test.
            xmax: the maximum x-axis value of the range to test.
            numSegments(default: 5): the number of segments to divide the function
                                     into to individually test for positive
                                     curvature.
            failureTolerance(default: None): the number of segments that can fail the
                                          positive curvature test before test
                                          failure. If None given uses default constant
                                          'curve_failure'.

        Returns:
            bool:
            true if all segments, in the range xmin to xmax, have positive curvature within tolerances,
            otherwise false.
        """
        if failureTolerance is None:
            failureTolerance = self.tolerance["curve_failure"]

        if self.does_not_exist_between(xmin, xmax, tolerance=10):
            if self.debug:
                self.debugger.add(f"Function does not exist in range [{xmin},{xmax}]")
            return "ndef"

        return self.has_curvature_between(
            xmin, xmax, numSegments, failureTolerance, lesser_or_equal
        )

    def has_negative_curvature_between(
        self, xmin, xmax, numSegments=5, failureTolerance=None
    ):
        """Return whether the function has negative curvature in the range xmin to xmax.

        Args:
            xmin: the minimum x-axis value of the range to test.
            xmax: the maximum x-axis value of the range to test.
            numSegments(default: 5): the number of segments to divide the function
                                     into to individually test for negative
                                     curvature.
            failureTolerance(default: None): the number of segments that can fail the
                                          negative curvature test before test
                                          failure. If None given uses default constant
                                          'curve_failure'.

        Returns:
            bool:
            true if all segments, in the range xmin to xmax, have negative curvature within tolerances,
            otherwise false.
        """
        if self.does_not_exist_between(xmin, xmax, tolerance=10):
            if self.debug:
                self.debugger.add(f"Function does not exist in range [{xmin},{xmax}]")
            return "ndef"

        if failureTolerance is None:
            failureTolerance = self.tolerance["curve_failure"]

        return self.has_curvature_between(
            xmin, xmax, numSegments, failureTolerance, greater_or_equal
        )

    # helper function for has_increasing_curvature_between and has_decreasing_curvature_between
    # does most of the work, but the comparer differs for the two functions
    # breaks the function up into some segments, and checks if the delta_y has appropriately higher or lower
    def has_curvature_between(
        self, xmin, xmax, numSegments, failureTolerance, comparer
    ):
        [xleft, xright] = self.get_between_vals(xmin, xmax)
        if xleft > xright:
            if self.debug:
                self.debugger.add(f"Function does not exist in range [{xmin},{xmax}]")
            return "ndef"

        xvals, yvals, delta = self.get_sample_points(numSegments + 1, xleft, xright)
        yvals = [y for y in yvals if self.within_y_range(y)]
        ydiffs = [yvals[i + 1] - yvals[i] for i in range(len(yvals) - 1)]

        if len(ydiffs) < 2:
            if self.debug:
                self.debugger.add(
                    f"Only two points to compare on function within range [{xmin},{xmax}]"
                )
            return False

        # set up debug
        if self.debug:
            self.debugger.var1 = 0  # keep track of index of point checked
            self.debugger.var2 = []  # keep track of indices where the value was incorrect
            self.debugger.var3 = (
                xvals  # store the x values for later reference when adding message
            )

        return self.always_comparer_at_points(comparer, ydiffs, delta, failureTolerance)

    def defined_at_x(self, x, tolerance):
        """Returns if the function exists at or is close to the line x=x within a tolerance."""
        tol = tolerance / self.xscale
        x_vals = self.find_closest_xvals(x)
        if len(x_vals) == 1:
            return True
        # See if closest xvals exist within tolerance of x
        if abs(x_vals[0] - x) <= tol or abs(x_vals[1] - x) <= tol:
            return True
        else:
            if self.debug:
                self.debugger.add(
                    f"Function is {min(abs(x_vals[0] - x), abs(x_vals[1] - x)) * self.xscale} pixels away from x = {x}."
                )
                self.debugger.add(f"Max allowed difference is {tolerance} pixels.")
            return False

    def defined_at_y(self, y, tolerance):
        """Returns if the function exists at or is close to the line y=y within a tolerance."""
        tol = tolerance / self.yscale
        y_vals = self.find_closest_yvals(y)
        if (
            len(y_vals) == 1 or abs(y_vals[0] - y) <= tol or abs(y_vals[1] - y) <= tol
        ):  # if value found
            return True
        else:
            if self.debug:
                self.debugger.add(
                    f"Function is {min(abs(y_vals[0] - y), abs(y_vals[1] - y)) * self.yscale} pixels away from y = {y}."
                )
                self.debugger.add(f"Max allowed difference is {tolerance} pixels.")
            return False

    def has_value_at(self, x, y, tolerance=None):
        """Returns if the function exists at both or either of the x and y value within a tolerance."""
        if x is None:
            return self.defined_at_y(y, tolerance)
        if y is None:
            return self.defined_at_x(x, tolerance)
        return self.has_value_y_at_x(
            x=x, y=y, yTolerance=tolerance, xTolerance=tolerance
        )

    # Helper Functions ###

    def get_range_defined(self):
        xvals = []
        if self.functions:
            xvals = self.get_domain()
        else:
            margin = 6 / self.xscale
            for point in self.points:
                xvals.append([point.x - margin, point.x + margin])
        rd = collapse_ranges(xvals)
        return rd

    def x_in_rd(self, x):
        return any(x <= rd[1] and x >= rd[0] for rd in self.domain)

    # finds the closest (largest) xval from the left, and the closest (smallest) xval from the right
    def find_closest_xvals(self, xval):
        # gets start and end vals for each spline, then sorts them to the left and right
        xvals = []
        if self.x_in_rd(xval):
            return [xval]

        for function in self.functions:
            domain = function.get_domain()
            for d in domain:
                xvals += d
        xvals_left = [x for x in xvals if x <= xval]
        xvals_left.append(float("-inf"))
        xvals_right = [x for x in xvals if x >= xval]
        xvals_right.append(float("inf"))

        return [np.max(xvals_left), np.min(xvals_right)]

    def find_closest_yvals(self, yval):
        # gets start and end vals for each spline, then sorts them to the left and right
        yvals = []
        for function in self.functions:
            min = function.get_min_value_between(
                self.xaxis.domain[0], self.xaxis.domain[1]
            )
            max = function.get_max_value_between(
                self.xaxis.domain[0], self.xaxis.domain[1]
            )
            if yval >= min and yval <= max:
                return [yval]
            yvals.append(min)
            yvals.append(max)
        yvals = [y for y in yvals if self.within_y_range(y)]
        yvals_below = [y for y in yvals if y <= yval]
        yvals_below.append(float("-inf"))
        yvals_above = [y for y in yvals if y >= yval]
        yvals_above.append(float("inf"))

        return [np.max(yvals_below), np.min(yvals_above)]

    def get_between_vals(self, xmin, xmax):
        xleft = self.find_closest_xvals(xmin)[-1]
        xright = self.find_closest_xvals(xmax)[0]
        return [xleft, xright]

    def get_sample_points(self, numPoints, xmin, xmax):
        # samples the function at some points, returns x and y values
        closest_to_xmin = self.find_closest_xvals(xmin)
        if len(closest_to_xmin) == 1:
            xmin = closest_to_xmin[0]
        else:
            xmin = closest_to_xmin[-1]
        closest_to_xmax = self.find_closest_xvals(xmax)
        xmax = closest_to_xmax[0]
        segmentLength = (xmax - xmin) * 1.0 / (numPoints - 1)
        delta = [segmentLength] * (numPoints - 1) + [0]
        segment_i_begin = xmin

        xvals = []
        yvals = []

        for _ in range(numPoints):
            # begin_no_gap indicates that the gap at segment_i_begin, if it exists, is small, or that there is 'no' gap there
            _, begin = self.get_value_at_gap(segment_i_begin)
            xvals.append(segment_i_begin)
            yvals.append(begin)

            segment_i_begin += segmentLength

        return xvals, yvals, delta

    # helper function for is_always_increasing, **decreasing, and has_curvature_between
    def always_comparer_at_points(self, comparer, values, delta, failureTolerance=1):
        # checks that applying comparer to each successive pair of values is true, allowing for failureTolerance
        # 'removes' a value if it does not satisfy the comparer
        # TODO: try both sides? (since a comparer requires two to fail)

        n = len(values)

        scale = self.xscale / self.yscale

        for i in range(n - 1):
            if self.debug:
                self.debugger.var1 += 1
            f = comparer(values[i], values[i + 1], delta[i] * scale)
            if f > 0:
                if self.debug:
                    self.debugger.var2.append(self.debugger.var1)
                newFailureTolerance = failureTolerance - f
                if newFailureTolerance < 0:
                    if self.debug:
                        self.debugger.add("More than <Tolerance> segments failed.")
                        self.debugger.add("Failure(s) at the following x values:")
                        self.debugger.add(
                            f"{[self.debugger.var3[x_index] for x_index in self.debugger.var2]}"
                        )
                        self.debugger.add("Returning False")
                    return False

                newValues = [values[i + 1], *values[i + 2 : n]]
                newDelta = [delta[i + 1], *delta[i + 2 : n]]
                newDelta[0] = newDelta[0]  # + delta[i+1]
                return self.always_comparer_at_points(
                    comparer, newValues, newDelta, newFailureTolerance
                )

        return True

    # returns no_gap, value
    def get_value_at_gap(self, xval):
        # no_gap is a boolean that indicates that the gap, if it exists, is small enough to not be considered a gap
        # value is the value of the function at the xval. if there is a gap, the value is obtained by interpolation
        # TODO: get_value_at edge? currently returns the other one if one is False
        xvals = self.find_closest_xvals(xval)
        if len(xvals) == 1:
            return True, self.get_value_at(xvals[0])

        xdiff = xvals[1] - xvals[0]
        yleft = self.get_value_at(xvals[0])
        yright = self.get_value_at(xvals[1])

        if yleft is None:
            return None, yright
        if yright is None:
            return None, yleft

        ydiff = yright - yleft

        return (xdiff < self.tolerance["gap"]), yleft + (
            xval - xvals[0]
        ) * 1.0 * ydiff / xdiff

    # strict does not exist between. Will return false if anything is within the xmin xmax range
    def does_not_exist_between(self, xmin, xmax, tolerance=0):
        """Return whether the function has no values defined in the range xmin to xmax.

        Args:
            xmin: the minimum x-axis value of the range to test.
            xmax: the maximum x-axis value of the range to test.
            tolerance: the number of pixels that can overlap the range in order for the range to still be considered empty
        Returns:
            bool:
            true if none of the function is in the range
        """
        # get range in which function is defined
        rd = self.get_range_defined()
        g_tol = tolerance / self.xscale

        # for each range, check if xmin and xmax are within or encompassing that range => the function exists in that range
        for r in rd:
            if xmin >= r[0] and xmin < r[1] - g_tol:
                return False
            if xmax > r[0] + g_tol and xmax <= r[1]:
                return False
            if xmin < r[0] and xmax > r[1]:
                return False
        return True

    def does_exist_between(self, xmin, xmax):
        """Return whether the function has values defined in the range xmin to xmax.

        Args:
            xmin: the minimum x-axis value of the range to test.
            xmax: the maximum x-axis value of the range to test.

        Returns:
            bool:
            true if any part of the function is within the range (to a reasonable degree)
        """
        return not self.does_not_exist_between(xmin, xmax, tolerance=5)

    # Other Functions from SketchResponse ###
    def has_slope_m_at_x(self, m, x, tolerance=None):
        """Return whether the function has slope m at the value x.

        Args:
            m: the slope value to test against.
            x: the position on the x-axis to test against.
            tolerance(default:None): angle tolerance in degrees. If None given uses
                                     default constant 'angle'.

        Returns:
            bool:
            true if the function at value x has slope m within tolerances,
            otherwise false.
        """
        if tolerance is None:
            tolerance = self.tolerance["angle"] * math.radians(1)
        else:
            tolerance *= math.radians(1)

        # compares the expected angle (from the expected slope m) and the actual angle
        expectedAngle = np.arctan2(self.yscale * m, self.xscale * 1)
        no_gap, actualAngle = self.get_angle_at_gap(x)
        return abs(expectedAngle - actualAngle) < tolerance

    def has_constant_value_y_between(self, y, xmin, xmax):
        """Return whether the function has a constant value y over the range xmin to xmax.

        Args:
            y: the constant value to check.
            xmin: the minimum x-axis value of the range to test.
            xmax: the maximum x-axis value of the range to test.

        Returns:
            bool:
            true if the function has the value y at both xmin and xmax and the function
            is straight in the range xmin to xmax, otherwise false.
        """
        if not self.has_value_y_at_x(y, xmin):
            return False
        if not self.has_value_y_at_x(y, xmax):
            return False
        return self.is_straight_between(xmin, xmax)

    # returns no_gap, angle
    # angle is the angle at the xval if it exists, or the angle from the left point of the gap to the right
    # TODO: handle edges
    def get_angle_at_gap(self, xval):
        xvals = self.find_closest_xvals(xval)
        if len(xvals) == 1:
            return True, self.get_angle_at(xval)

        xdiff = xvals[1] - xvals[0]
        yleft = self.get_value_at(xvals[0])
        yright = self.get_value_at(xvals[1])
        if yleft is None:
            yleft = 0
        if yright is None:
            yright = 0
        ydiff = yright - yleft

        return (xdiff < self.tolerance["gap"]), np.arctan2(
            self.yscale * ydiff, self.xscale * xdiff
        )

    def comparer(self, x1, x2, leeway):
        if x1 == float("-inf"):
            return True
        if x2 == float("inf"):
            return True

        else:
            return (x1 - x2) < leeway

    # checks that the local minima between xmin and xmax is at x
    # may specify xmin and xmax directly, or with a delta value that indicates them, or leave it to the default delta
    def has_min_at(self, x, delta=None, xmin=None, xmax=None):
        """Return if the function has a local minimum at the value x.

        Args:
            x: the x-axis value to test.
            delta(default:False): the delta value to sample on either side of x
                                  (not setting it uses a default value).
            xmin(default:False): the position of the value left of x to compare
                                 (not setting it uses the value x - delta).
            xmax(default:False): the position of the value right of x to compare
                                 (not setting it uses the value x + delta).

        Returns:
            bool:
            true if the value of the function at x is less than both the values at
            xmin and xmax, otherwise false.
        """
        # checks if the actual local minima is 'close' to the value at x. if it is, this should probably be accepted as a local minima
        if delta is None:
            delta = self.tolerance["extrema"] / self.xscale
        if xmin is None:
            xmin = x - delta
        if xmax is None:
            xmax = x + delta

        yleft = self.get_value_at_gap(xmin)[1]
        y = self.get_value_at_gap(x)[1]
        yright = self.get_value_at_gap(xmax)[1]

        return yleft > y and yright > y

    # see has_min_at
    def has_max_at(self, x, delta=None, xmin=None, xmax=None):
        """Return if the function has a local maximum at the value x.

        Args:
            x: the x-axis value to test.
            delta(default:False): the delta value to sample on either side of x
                                  (not setting it uses a default value).
            xmin(default:False): the position of the value left of x to compare
                                 (not setting it uses the value x - delta).
            xmax(default:False): the position of the value right of x to compare
                                 (not setting it uses the value x + delta).

        Returns:
            bool:
            true if the value of the function at x is greater than both the values
            at xmin and xmax, otherwise false.
        """
        if delta is None:
            delta = self.tolerance["extrema"] / self.xscale
        if xmin is None:
            xmin = x - delta
        if xmax is None:
            xmax = x + delta

        yleft = self.get_value_at_gap(xmin)[1]
        y = self.get_value_at_gap(x)[1]
        yright = self.get_value_at_gap(xmax)[1]

        return yleft < y and yright < y
