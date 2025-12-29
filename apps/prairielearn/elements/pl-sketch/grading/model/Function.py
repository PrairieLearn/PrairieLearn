from .Debugger import Debugger
from .Tag import Tag, Tagables


# Function interface
class Function(Tag, Tagables):  # noqa: PLR0904
    """Base class for Functions."""

    # create the Function
    # establishes the axes, the size (from the axes), and the tolerance, with default tolerance of 20 pixels
    # Function info will be stored in terms of the function itself, not the pixel information
    # the actual path is yet to be specified
    def __init__(self, xaxis, yaxis, path_info=[], tolerance=dict()):
        super().__init__()
        self.xaxis = xaxis
        self.yaxis = yaxis
        self.width = xaxis.pixels
        self.height = yaxis.pixels
        self.xscale = 1.0 * self.width / (xaxis.domain[1] - xaxis.domain[0])
        self.yscale = 1.0 * self.height / (yaxis.domain[0] - yaxis.domain[1])

        self.tolerance = tolerance
        self.set_default_tolerance("pixel", 20)
        self.set_default_tolerance("comparison", 20)
        if "grader" in path_info:
            self.debug = path_info["grader"]["debug"]
            if self.debug:
                self.debugger = Debugger(
                    path_info["grader"]["type"],
                    path_info["grader"]["currentTool"],
                    path_info["grader"]["tolerance"],
                    path_info["grader"].get("pt_tolerance", None),
                )

        self.create_from_path_info(path_info)

        # check if it is a function, and do something it is not

    # helper methods for constructor

    def set_default_tolerance(self, key, default_value):
        if key not in self.tolerance:
            self.tolerance[key] = default_value

    def set_tolerance(self, key, value):
        self.tolerance[key] = value

    # sets the variables related to the path, and finds the domain
    def create_from_path_info(self, path_info):
        self.domain = []

    # methods to handle pixel <-> math conversions

    def _xval_to_px(self, xval):
        return self.xaxis.coord_to_pixel(xval)

    def _px_to_xval(self, px):
        return self.xaxis.pixel_to_coord(px)

    def _yval_to_px(self, yval):
        return self.yaxis.coord_to_pixel(yval)

    def _px_to_yval(self, px):
        return self.yaxis.pixel_to_coord(px)

    # methods for getting various properties of the function at certain locations
    # done in math space, not pixel space

    def is_between(self, xmin, xmax):
        dom = self.domain
        dom_start = dom[0]
        dom_end = dom[-1]
        xleft = dom_start[0]
        xright = dom_end[-1]
        if xleft > xmax or xright < xmin:
            return False
        else:
            return True

    def within_y_range(self, y_val, negative_tolerance=0, positive_tolerance=0):
        if y_val is None:
            return False
        yrange = self.yaxis.domain
        height = self.yaxis.pixels
        scale = abs(yrange[0] - yrange[1]) / height
        g_neg_t = negative_tolerance * scale
        g_pos_t = positive_tolerance * scale
        return y_val <= (yrange[0] - g_neg_t + g_pos_t) and y_val >= (
            yrange[1] + g_neg_t - g_pos_t
        )

    def within_x_range(self, x_val, negative_tolerance=0, positive_tolerance=0):
        if x_val is None:
            return False
        xrange = self.xaxis.domain
        width = self.xaxis.pixels
        scale = abs(xrange[1] - xrange[0]) / width
        g_neg_t = negative_tolerance * scale
        g_pos_t = positive_tolerance * scale
        return x_val >= (xrange[0] + g_neg_t - g_pos_t) and x_val <= (
            xrange[1] - g_neg_t + g_pos_t
        )

    def get_value_at(self, xval):
        raise NotImplementedError(
            "The get_value_at method is not implemented by this class."
        )

    def get_angle_at(self, xval):
        raise NotImplementedError(
            "The get_angle_at method is not implemented by this class."
        )

    def get_slope_at(self, xval):
        raise NotImplementedError(
            "The get_slope_at method is not implemented by this class."
        )

    def get_min_value_between(self, xmin, xmax):
        raise NotImplementedError(
            "The get_min_value_between method is not implemented by this class."
        )

    def get_max_value_between(self, xmin, xmax):
        raise NotImplementedError(
            "The get_max_value_between method is not implemented by this class."
        )

    def get_horizontal_line_crossings(self, yval):
        raise NotImplementedError(
            "The get_horizontal_line_crossings method is not implemented by this class."
        )

    def get_vertical_line_crossing(self, xval):
        raise NotImplementedError(
            "The get_vertical_line_crossing method is not implemented by this class."
        )

    def get_domain(self):
        raise NotImplementedError(
            "The get_domain method is not implemented by this class."
        )

    def does_not_exist_between(self, x1, x2, tolerance):
        raise NotImplementedError(
            "The does_not_exist_between method is not implemented by this class."
        )

    def get_sample_points(self, num, xmin, xmax):
        raise NotImplementedError(
            "The get_sample_points method is not implemented by this class."
        )

    # Grader functions ###

    def is_a_function(self):
        raise NotImplementedError(
            "The is_a_function method is not implemented by this class."
        )

    def has_value_y_at_x(self, y, x, yTolerance=None, xTolerance=None):
        """Return whether the function has the value y at x.

        Args:
            y: the target y value.
            x: the x value.
            yTolerance(default:None): the y-axis pixel distance within which
                                       the function value is accepted.
            xTolerance(default:None): the x-axis pixel distance within which
                                       the function value is accepted.

        Returns:
            bool:
            true if the function value at x is y within tolerances, otherwise
            false
        """
        if yTolerance is None:
            y_tolerance = self.tolerance["pixel"] / self.yscale
        else:
            y_tolerance = yTolerance / self.yscale
        if xTolerance is None:
            x_tolerance = self.tolerance["pixel"] / self.xscale
        else:
            x_tolerance = xTolerance / self.xscale

        # if the min value of the function around the desired x is higher than the desired y
        # or if the max value of the function around the desired x is lower
        # then it fails
        # note that if the function is defined above and below the function, no matter how far apart, this will allow it

        ymax = self.get_max_value_between(x - x_tolerance, x + x_tolerance)
        ymin = self.get_min_value_between(x - x_tolerance, x + x_tolerance)

        if ymax is not None and ymin is not None:
            if (ymax > y - y_tolerance) and (ymin < y + y_tolerance):
                return True
            else:
                if self.debug:
                    if y > ymax:
                        self.debugger.add(
                            f"Function is {abs(y - ymax) * self.yscale} pixels away from expected point."
                        )
                    if y < ymin:
                        self.debugger.add(
                            f"Function is {abs(y - ymin) * self.yscale} pixels away from expected point."
                        )
                    self.debugger.add(
                        f"Max allowed is {y_tolerance * self.yscale} pixels."
                    )
                return False
        else:
            if self.debug:
                self.debugger.add(
                    f"Function is not defined within {x_tolerance * self.xscale} pixels from x = {x}."
                )
            return False

    def is_zero_at_x_equals_zero(self, yTolerance=None, xTolerance=None):
        """Return whether the function is zero at x equals zero.

        Args:
            yTolerance(default:None): the y-axis pixel distance within which
                                       the function value is accepted.
            xTolerance(default:None): the x-axis pixel distance within which
                                       the function value is accepted.

        Returns:
            bool:
            true if the function value at x equals zero is zero within
            tolerances, otherwise false
        """
        return self.has_value_y_at_x(0, 0, yTolerance=yTolerance, xTolerance=xTolerance)

    def is_greater_than_y_between(self, y, xmin, xmax, tolerance=None):
        """Return whether function is always greater than y in the range xmin to xmax.

        Args:
            y: the target y value.
            xmin: the minimum x range value.
            xmax: the maximum x range value.
            tolerance(default:None): pixel distance tolerance. If None given uses
                                     default constant 'comparison'.

        Returns:
            bool:
            true if the minimum value of the function in the range (xmin,xmax)
            is greater than y within tolerances, otherwise false.
        """
        if tolerance is None:
            tolerance = self.tolerance["comparison"] / self.yscale
        else:
            tolerance /= self.yscale
        min_val = self.get_min_value_between(xmin, xmax)
        if min_val is None:
            if self.debug:
                self.debugger.add("Function (min val) does not exist.")
            return "ndef"
        else:
            if min_val > y - tolerance:
                return True
            if self.debug:
                self.debugger.add(
                    f"Min value {min_val} is {(y - min_val) * self.yscale} pixels below y = {y}."
                )
                self.debugger.add(f"Max allowed is {tolerance * self.yscale} pixels.")

    def is_less_than_y_between(self, y, xmin, xmax, tolerance=None):
        """Return whether function is always less than y in the range xmin to xmax.

        Args:
            y: the target y value.
            xmin: the minimum x range value.
            xmax: the maximum x range value.
            tolerance(default:None): pixel distance tolerance. If None given uses
                                     default constant 'comparison'.

        Returns:
            bool:
            true if the maximum value of the function in the range (xmin,xmax)
            is less than y within tolerances, otherwise false.
        """
        if tolerance is None:
            tolerance = self.tolerance["comparison"] / self.yscale
        else:
            tolerance /= self.yscale

        max_val = self.get_max_value_between(xmin, xmax)
        if max_val is None:
            if self.debug:
                self.debugger.add("Function (max val) does not exist.")
            return "ndef"
        else:
            if max_val < y + tolerance:
                return True
            if self.debug:
                self.debugger.add(
                    f"Max value {max_val} is {(max_val - y) * self.yscale} pixels above y = {y}."
                )
                self.debugger.add(f"Max allowed is {tolerance * self.yscale} pixels.")
