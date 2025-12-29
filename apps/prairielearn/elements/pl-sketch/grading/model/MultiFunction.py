import numpy as np

from grading.utils import collapse_ranges

from .Function import Function

# "interface" for Functions that are composed of multiple Functions
# i.e. MultipleSplinesFunction is composed of multiple SplineFunctions


class MultiFunction(Function):
    """MultiFunction."""

    # only provide path_info or functions, not both
    # will use functions if they exist
    def __init__(self, xaxis, yaxis, path_info=[], functions=[], tolerance=dict()):
        super().__init__(xaxis, yaxis, path_info, tolerance)
        self.set_default_tolerance("straight_line", 0.1)  # threshold for straight lines
        if functions:
            self.functions = functions

    def is_defined_at(self, xval):
        return any(function.is_defined_at(xval) for function in self.functions)

    # Function finders ##

    def find_function(self, xval):

        functionsList = [
            function for function in self.functions if function.is_defined_at(xval)
        ]

        return functionsList

    def find_functions_between(self, xmin, xmax):
        betweenFunctions = [
            function for function in self.functions if function.is_between(xmin, xmax)
        ]

        return betweenFunctions

    # "get" methods ##

    def get_value_at(self, xval):
        for function in self.functions:
            v = function.get_value_at(xval)
            if v is not None:
                return v
        return None

    def get_angle_at(self, xval):
        for function in self.functions:
            v = function.get_angle_at(xval)
            if v is not None:
                return v
        return None

    def get_domain(self):
        xvals = []
        for function in self.functions:
            xvals += function.get_domain()
        return collapse_ranges(xvals)

    def get_min_value_between(self, xmin, xmax):
        """Return the minimum value of the function in the domain [xmin, xmax].

        Args:
            xmin: the minimum x-axis value.
            xmax: the maximum x-axis value.

        Returns:
            [float|bool]:
            the minimum function value in the domain [xmin, xmax], or False if
            the function is not defined in that range.
        """
        functions = self.find_functions_between(xmin, xmax)
        minVals = []
        for function in functions:
            v = function.get_min_value_between(xmin, xmax)
            if v is not None and self.within_y_range(v):
                minVals.append(v)

        if minVals:
            return np.min(minVals)
        else:
            return None

    def get_max_value_between(self, xmin, xmax):
        """Return the maximum value of the function in the domain [xmin, xmax].

        Args:
            xmin: the minimum x-axis value.
            xmax: the maximum x-axis value.

        Returns:
            [float|bool]:
            the maximum function value in the domain [xmin, xmax], or False if
            the function is not defined in that range.
        """
        functions = self.find_functions_between(xmin, xmax)
        maxVals = []
        for function in functions:
            v = function.get_max_value_between(xmin, xmax)
            if v is not None and self.within_y_range(v):
                maxVals.append(v)

        if maxVals:
            return np.max(maxVals)
        else:
            return None

    def get_horizontal_line_crossings(self, yval):
        """Return a list of the values where the function crosses the horizontal line y=yval.

        Args:
            yval: the y-axis value of the horizontal line.

        Returns:
            [float]:
            the list of values where the function crosses the line y=yval.
        """
        xvals = []
        for function in self.functions:
            xvals += function.get_horizontal_line_crossings(yval)

        return xvals

    def get_vertical_line_crossings(self, xval):
        """Return a list of the values where the function crosses the horizontal line x=xval.

        Args:
            xval: the x-axis value of the vertical line.

        Returns:
            [float]:
            the list of values where the function crosses the line x=xval.
        """
        yvals = []
        for function in self.functions:
            yvals += function.get_vertical_line_crossings(xval)

        return yvals

    # Grader functions ###

    def is_straight(self):
        """Return whether the function is straight over its entire domain.

        Returns:
            bool:
            true if the function is straight within tolerances over the entire
            domain, otherwise false.
        """
        domain = self.get_domain()
        return all(self.is_straight_between(d[0], d[1]) for d in domain)

    def is_straight_between(self, xmin, xmax):
        """Return whether the function is straight within the range xmin to xmax. An alternate approximate implementation until we sort out some issues above

        Args:
            xmin: the minimum x-axis value of the range to check.
            xmax: the maximum x-axis value of the range to check.

        Returns:
            bool:
            true if the function is straight within tolerances between xmin and xmax,
            otherwise false
        """
        if self.does_not_exist_between(xmin, xmax, 0):
            return False

        # Apply tolerances at boundaries:
        xmin = self._px_to_xval(
            self._xval_to_px(xmin) + self.tolerance["point_distance"]
        )
        xmax = self._px_to_xval(
            self._xval_to_px(xmax) - self.tolerance["point_distance"]
        )

        # Sample between boundaries and convert to pixels:
        xvals, yvals, _ = self.get_sample_points(25, xmin, xmax)
        xvals = [self._xval_to_px(xval) for xval in xvals]
        yvals = [self._yval_to_px(yval) for yval in yvals]

        # Fit a straight line and find the maximum perpendicular distance from it:
        m, b = np.polyfit(xvals, yvals, 1)
        max_dist = np.max(
            np.abs(m * np.array(xvals) - np.array(yvals) + b) / np.sqrt(m**2 + 1)
        )

        # Approximate the "length" of the line by taking the distance between first/last points:
        length = np.sqrt((xvals[-1] - xvals[0]) ** 2 + (yvals[-1] - yvals[0]) ** 2)

        return bool(max_dist < 0.4 * self.tolerance["straight_line"] * length)
