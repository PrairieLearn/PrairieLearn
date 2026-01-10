from collections.abc import Callable

import numpy as np

from .Axis import Axis
from .Debugger import Debugger
from .Tag import Tagable


class Gradeable(Tagable):
    def __init__(
        self, grader, submission, current_tool, tolerance=dict()
    ):  # gradeable_info : {"grader": grader, "submission": submission}
        super().__init__()
        self.grader = grader
        self.submission = submission
        self.current_tool = current_tool
        config = submission["meta"]["config"]
        xaxis = Axis(config["xrange"], config["width"])
        yaxis = Axis(config["yrange"][::-1], config["height"])
        self.xaxis = xaxis
        self.yaxis = yaxis
        self.width = xaxis.pixels
        self.height = yaxis.pixels
        self.xscale = 1.0 * self.width / (xaxis.domain[1] - xaxis.domain[0])
        self.yscale = 1.0 * self.height / (yaxis.domain[0] - yaxis.domain[1])

        self.tolerance = tolerance
        self.debug = grader["debug"]
        self.debug_message = ""
        if self.debug:
            self.debugger = Debugger(
                grader["type"],
                current_tool,
                grader["tolerance"],
            )

    def set_default_tolerance(self, key, default_value):
        if key not in self.tolerance:
            self.tolerance[key] = default_value

    # value <-> pixel conversions ##

    def _xval_to_px(self, xval):
        return self.xaxis.coord_to_pixel(xval)

    def _px_to_xval(self, px):
        return self.xaxis.pixel_to_coord(px)

    def _yval_to_px(self, yval):
        return self.yaxis.coord_to_pixel(yval)

    def _px_to_yval(self, px):
        return self.yaxis.pixel_to_coord(px)

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

    def add_debug(self, str):
        self.debug_message += "\n"
        self.debug_message += str

    def point_ltgt_function(
        self,
        point: tuple[float, float],
        func: Callable[[float], float],
        greater: bool,
        tolerance: int,
    ) -> bool:
        # set up debug
        if self.debug:
            self.debugger.clear_vars()
            self.debugger.var1 = float("inf")  # store lowest distance
        test_range = [
            point[0] - tolerance / self.xscale,
            point[0] + tolerance / self.xscale,
        ]
        one_unit = 1 / self.xscale  # check each pixel in test_range
        g_tol = tolerance / self.yscale
        for i in range(tolerance * 2 + 1):
            x = test_range[0] + i * one_unit
            try:
                fun_y = func(x)
                if greater:
                    if point[1] >= fun_y - g_tol:
                        return True
                elif point[1] <= fun_y + g_tol:
                    return True
                if self.debug:
                    self.debugger.var1 = min(
                        self.debugger.var1, abs(point[1] - fun_y) * self.yscale
                    )
            except Exception:
                continue
        if self.debug:
            if greater:
                self.debugger.add(
                    f"Point [{point[0]},{point[1]}] is {self.debugger.var1} pixels below the function."
                )
                self.debugger.add(f"Max allowed is {tolerance}.")
            else:
                self.debugger.add(
                    f"Point [{point[0]},{point[1]}] is {self.debugger.var1} pixels above the function."
                )
                self.debugger.add(f"Max allowed is {tolerance}.")
        return False

    def point_on_function(
        self,
        point: tuple[float, float],
        func: Callable[[float], float],
        tolerance: int,
    ) -> bool:
        """Returns whether the point is on the function specified within tolerance
        Args:
            point: a list of two values representing the point's coordinates in an [x,y] format (ex. [1,1])
            func: a callable function (ex. lambda x : x^2)

        Returns:
            boolean value representing whether the point is on the function
        """
        # set up debugger vars
        if self.debug:
            self.debugger.clear_vars()
            self.debugger.var2 = float("inf")

        np.seterr(invalid="ignore")
        test_range = [
            point[0] - tolerance / self.xscale,
            point[0] + tolerance / self.xscale,
        ]
        one_unit = 1 / self.xscale  # check each pixel in test_range

        for i in range(tolerance * 2 + 1):
            x = test_range[0] + i * one_unit
            try:
                fun_y = func(x)
                if not self.within_y_range(fun_y, negative_tolerance=10):
                    continue
                d = abs(point[1] - fun_y) * self.yscale
                if d <= tolerance:
                    np.seterr(invalid="warn")
                    return True
                if self.debug:
                    self.debugger.var1 = (
                        [x, fun_y] if d < self.debugger.var2 else self.debugger.var1
                    )
                    self.debugger.var2 = min(self.debugger.var2, d)
            except Exception as e:
                if self.debug:
                    self.debugger.add(
                        f"Error calculating function at x = {point[0]}: {e}"
                    )
                continue
        np.seterr(invalid="warn")
        if self.debug:
            self.debugger.add(f"Submitted Point: {point}")
            self.debugger.add(f"Closest Actual Point: {self.debugger.var1}")
            self.debugger.add(f"y-Distance: {self.debugger.var2} px")
        return False

    def collapse_ranges(self, ranges: list[list[float]]) -> list[list[float]]:
        all_ranges = ranges
        if len(ranges) == 1:
            return ranges
        sorted_ranges = sorted(all_ranges, key=lambda x: x[0], reverse=False)
        xrange = []
        highest_end = None
        for i in range(len(sorted_ranges)):
            if highest_end is None:
                xrange.append(sorted_ranges[i][0])
                highest_end = sorted_ranges[i][1]
            elif highest_end < sorted_ranges[i][0]:
                xrange.extend((highest_end, sorted_ranges[i][0]))
                highest_end = sorted_ranges[i][1]
            elif highest_end < sorted_ranges[i][1]:
                highest_end = sorted_ranges[i][1]
        xrange.append(highest_end)
        ls = [[xrange[i], xrange[i + 1]] for i in range(0, len(xrange) - 1, 2)]
        return ls
