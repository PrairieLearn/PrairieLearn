import numpy as np

from grading.utils import (
    collapse_ranges,
    function_to_spline,
    get_coverage_px,
    point_ltgt_function,
    point_on_function,
    point_on_function_x_compare,
)

from .Axis import Axis
from .fit_curve import fitCurve
from .MultipleSplinesFunction import MultipleSplinesFunction
from .Point import Point
from .SplineFunction import SplineFunction


class GradeableFunction(MultipleSplinesFunction):  # noqa: PLR0904
    def __init__(self, gradeable, tolerance=dict()):
        f = gradeable["submission"]
        config = f["meta"]["config"]
        xaxis = Axis(config["xrange"], config["width"])
        yaxis = Axis(config["yrange"][::-1], config["height"])
        super().__init__(
            xaxis, yaxis, path_info=gradeable, tolerance=tolerance
        )  # TODO: path info directly set to f!
        self.set_default_tolerance(
            "point_distance_squared",
            gradeable["grader"]["tolerance"] * gradeable["grader"]["tolerance"],
        )  # threshold for finding a point close to a point

    def covers_function_domain(self, function, xmin, xmax, tolerance):
        """Return whether the submission covers the entire domain of the function (90%).

        Args:
            function: a callable function (ex. lambda x : x^2)
            xmin: the minimum x-axis value of the range to test.
            xmax: the maximum x-axis value of the range to test.
            tolerance: grading tolerance in percent covered

        Returns:
            bool:
            true if any part of the function is within the range (to a reasonable degree)
        """
        ranges = []
        splines = self.get_spline_graders_from_function(function, xmin, xmax)
        for spline in splines:
            ranges += spline.get_domain()
        coverage = 0
        for d in self.get_domain():
            coverage += get_coverage_px(self, ranges, d[0], d[1])
        total_coverage_needed = 0
        for r in ranges:
            total_coverage_needed += (r[1] - r[0]) * self.xscale
        overlap_percentage = coverage / total_coverage_needed
        if self.debug and overlap_percentage < tolerance:
            self.debugger.add(
                f"Submission covered only {overlap_percentage}% of function domain."
            )
            self.debugger.add(f"Lowest allowed is {tolerance}%.")
        return (coverage / total_coverage_needed) >= tolerance

    def get_spline_graders_from_function(self, func, xmin, xmax):
        range_data = {
            "x_start": self.xaxis.domain[0],
            "x_end": self.xaxis.domain[1],
            "y_start": self.yaxis.domain[1],
            "y_end": self.yaxis.domain[0],
            "width": self.xaxis.pixels,
            "height": self.yaxis.pixels,
        }
        values = []
        while True:  # handle function breaks
            x_y_vals, broken, new_start = function_to_spline(
                func, [xmin, xmax], range_data
            )
            if len(x_y_vals) > 0:
                x_y_vals = fitCurve(x_y_vals, 5)
                values.append(x_y_vals)
            if broken:
                xmin = new_start
            else:
                break
        splines = []
        for s in values:
            spline = SplineFunction(self.xaxis, self.yaxis, s)
            splines.append(spline)
        return splines

    def sample_points(self):
        spline_samples = []

        for f in self.functions:
            curve_samples = []
            # these are the spline function objects
            for curve in f.functions:
                # these are the curve function objects
                curve_samples.extend(self.sample_x_and_y(curve, 0.02))

            curve_samples.append(self.sample_last_t_1(f.functions[-1]))

            spline_samples.append(curve_samples)

        return spline_samples

    def sample_x_and_y(self, curve, step):

        samples = []
        x_t = curve.x
        y_t = curve.y

        for t in np.arange(0, 1, step):
            # interpolate the x and y values
            x = np.polyval(x_t, t)
            y = np.polyval(y_t, t)

            samples.append([x, y])

        return samples

    def sample_last_t_1(self, curve):
        x = np.polyval(curve.x, 1)
        y = np.polyval(curve.y, 1)

        return [x, y]

    def create_from_path_info(self, path_info):
        dtol = 100
        self.functions = []
        self.points = []
        xvals = []

        toolid = path_info["grader"]["currentTool"]
        submission_data = path_info["submission"]["gradeable"][toolid]
        for i in range(len(submission_data)):
            if "spline" in submission_data[i]:
                spline = SplineFunction(
                    self.xaxis, self.yaxis, submission_data[i]["spline"]
                )
                self.functions.append(spline)
                xvals += spline.get_domain()
                self.domain = collapse_ranges(xvals)
            if "point" in submission_data[i]:
                [px_x, px_y] = submission_data[i]["point"]
                point = Point(self, px_x, px_y)
                d, _ = self.closest_point_to_point(point, squared=True)
                if d >= dtol:
                    self.points.append(point)
        # # Tag support
        #     if 'tag' in submission_data[i]:
        #         tag = submission_data[i]['tag']
        #         if len(self.functions) > 0:
        #             self.functions[-1].set_tag(tag)
        #         elif len(self.points) > 0:
        #             self.points[-1].set_tag(tag)

        # # set the gradeable object list to the tagable list
        # self.set_tagables(None)
        # if len(self.functions) > 0:
        #     self.set_tagables(self.functions)
        # if len(self.points) > 0:
        #     self.set_tagables(self.points)

    # Grader Functions ##
    def has_point_at(self, x, y, distTolerance, point=None):
        """Return whether a point is declared at the given value.

        Args:
            x: the x coordinate of interest.
            y: the y coordinate of interest.
            distTolerance: the pixel distance tolerance if
                                          only the x coordinate is given.
            point(default: None): a Point instance at the value of interest.

        Note:
           There are four use cases:
              1) point not False: use the Point instance as the target to locate a point in the function.
              2) x and y not False: use (x, y) as the target to locate a point in the function.
              3) x not False: use only the x coordinate to locate a point in the function, returning the first Point with the given x value.
              3) y not False: use only the y coordinate to locate a point in the function, returning the first Point with the given y value.

        Returns:
            bool:
            true if there is a Point declared within tolerances of the given
            argument(s), false otherwise.
        """
        if point is None and y is None:
            dist, point = self.closest_point_to_x(x)
            tol = distTolerance / self.xscale
            if dist < tol:
                return True
            if self.debug:
                self.debugger.add(
                    f"Closest point ({point.x}, {point.y}) is {dist * self.xscale} pixels away from x = {x}."
                )
                self.debugger.add(f"Max allowed is {distTolerance} pixels.")

            return False
        if point is None and x is None:
            dist, point = self.closest_point_to_y(y)
            tol = distTolerance / self.yscale
            if dist < tol:
                return True
            if self.debug:
                self.debugger.add(
                    f"Closest point ({point.x}, {point.y}) is {dist * self.yscale} pixels away from y = {y}."
                )
                self.debugger.add(f"Max allowed is {distTolerance} pixels.")
            return False
        return (
            self.get_point_at(point=point, x=x, y=y, distTolerance=distTolerance)
            is not None
        )

    def points_less_than_y(self, y, x1, x2, tolerance):
        """Returns whether all the points in range x1, x2 are below the line f(x)=y"""
        return self.points_ltgt_y(y, x1, x2, False, tolerance)

    def points_greater_than_y(self, y, x1, x2, tolerance):
        """Returns whether all the points in range x1, x2 are above the line f(x)=y"""
        return self.points_ltgt_y(y, x1, x2, True, tolerance)

    # main helper for points_less_than_y and points_greater_than_y
    def points_ltgt_y(self, y, x1, x2, greater, tolerance):
        points = self.get_points_in_range(x1, x2)
        if len(points) == 0:
            if self.debug:
                self.debugger.add("Point not found.")
            return "ndef"
        g_tol = tolerance / self.yscale
        if greater:
            if all(p.y >= y - g_tol for p in points):
                return True
            if self.debug:
                no_pass = [p for p in points if p.y < y - g_tol]
                self.debugger.add(
                    f"Point {no_pass[0].x, no_pass[0].y} is {round((y - no_pass[0].y) * self.yscale, 3)} pixels below y = {y}."
                )
                self.debugger.add(f"Max allowed is {tolerance} pixels.")
        else:
            if all(p.y <= y + g_tol for p in points):
                return True
            if self.debug:
                no_pass = [p for p in points if p.y > y + g_tol]
                self.debugger.add(
                    f"Point {no_pass[0].x, no_pass[0].y} is {round((y - no_pass[0].y) * self.yscale, 3)} pixels above y = {y}."
                )
                self.debugger.add(f"Max allowed is {tolerance} pixels.")

    def matches_function(self, func, x1, x2, tolerance):
        """Returns whether all the points in range x1, x2 are on the function"""
        if self.functions:
            if self.does_not_exist_between(x1, x2, tolerance=2):
                return False
            # want to avoid the exact endpoints
            xvals, yvals, _ = self.get_sample_points(20, x1, x2)
            points = [[xvals[i], yvals[i]] for i in range(len(xvals))]
            max_incorrect = 0
        else:
            points = self.get_points_in_range(x1, x2)
            points = [[p.x, p.y] for p in points]
            max_incorrect = 0 if len(points) < 5 else 1
        if len(points) == 0:
            return False
        count_incorrect = 0
        splines = []
        for p in points:
            if count_incorrect > max_incorrect:
                return False
            if self.points:
                if not point_on_function(self, p, func, tolerance):
                    count_incorrect += 1
            else:
                no_gap, angle = self.get_angle_at_gap(p[0])
                if (angle and abs(angle) > 1.3) or (
                    not no_gap
                ):  # if the slope is very steep, or at an endpoint
                    if len(splines) == 0:
                        splines = self.get_spline_graders_from_function(
                            func,
                            x1 - (tolerance / self.xscale),
                            x2 + (tolerance / self.xscale),
                        )
                    if not point_on_function_x_compare(self, p, splines, tolerance):
                        count_incorrect += 1
                elif not point_on_function(self, p, func, tolerance):
                    count_incorrect += 1
        return count_incorrect <= max_incorrect

    def lt_function(self, func, x1, x2, tolerance):
        """Returns whether all the points in range x1, x2 are less than the function"""
        return self.ltgt_func(func, x1, x2, tolerance, greater=False)

    def gt_function(self, func, x1, x2, tolerance):
        """Returns whether all the points in range x1, x2 are greater than the function"""
        return self.ltgt_func(func, x1, x2, tolerance, greater=True)

    # main helper for lt_function and gt_function
    def ltgt_func(self, func, x1, x2, tolerance, greater):
        if not self.points:
            if self.does_not_exist_between(x1, x2, tolerance=10):
                if self.debug:
                    self.debugger.add("No values found in range.")
                return "ndef"
            xvals, yvals, _ = self.get_sample_points(20, x1, x2)
            points = [[xvals[i], yvals[i]] for i in range(len(xvals))]
            max_incorrect = 0
        else:
            points = self.get_points_in_range(x1, x2)
            if len(points) == 0:
                if self.debug:
                    self.debugger.add("No points found in range.")
                return "ndef"
            points = [[p.x, p.y] for p in points]
            max_incorrect = 0 if len(points) < 10 else 1

        count_incorrect = 0
        for p in points:
            if count_incorrect > max_incorrect:
                return False
            if not point_ltgt_function(self, p, func, greater, tolerance):
                count_incorrect += 1  # see if we want to do a nicer tolerance for how many points can be off.
        return count_incorrect <= max_incorrect

    # Helper Functions ##
    def get_number_of_points(self):
        """Return the number of points declared in the function."""
        return len(self.points)

    def get_points_in_range(self, xmin, xmax):
        """Return the number of points declared in the function between xmin and xmax."""
        return [point for point in self.points if point.x >= xmin and point.x <= xmax]

    def get_point_at(self, distTolerance, point=None, x=None, y=None):
        """Return a reference to the Point declared at the given value.

        Args:
            point(default: False): a Point instance at the value of interest.
            x(default: False): the x coordinate of interest.
            y(default: False): the y coordinate of interest.
            distTolerance(default: None): the pixel distance tolerance if
                                          only the x coordinate is given.

        Note:
           There are three use cases:
              1) point not False: use the Point instance as the target to locate a point in the function.
              2) x and y not False: use (x, y) as the target to locate a point in the function.
              3) x not False: use only the x coordinate to locate a point in the function, returning the first Point with the given x value.

        Returns:
            Point:
            the first Point instance within tolerances of the given arguments, or None
        """
        # set up debug
        if self.debug:
            self.debugger.var1 = float("inf")  # used to calculate minDistance

        if point is not None:
            distance, found_point = self.closest_point_to_point(point)
            if distance < distTolerance:
                return found_point
            if self.debug and distance < self.debugger.var1:
                self.debugger.var1 = distance
                self.debugger.var2 = found_point

        if y is not None and x is not None:
            point = Point(self, x, y, pixel=False)
            return self.get_point_at(point=point, distTolerance=distTolerance)

        if x is not None:
            distance, found_point = self.closest_point_to_x(x)
            if distance < distTolerance:
                return found_point

        if self.debug:
            self.debugger.add(
                f"Point ({self.debugger.var2.x},{self.debugger.var2.y}) is {self.debugger.var1} pixels away from expected point."
            )
            self.debugger.add(f"Max allowed is {distTolerance} pixels.")

        return None

    def closest_point_to_point(self, point, squared=False):
        """Return the square pixel distance or euclidean distance to the closest point
           and a Point instance.

        Args:
            point: a Point instance
            squared: boolean value representing whether to use the squared distance
                                tolerance or euclidean distance tolerance
        Returns:
            float, Point: the square of the pixel distance between point
                                and the closest point, or float('inf') if no point exists,
                                and the closest Point to x, or None if no point exists.
        """
        min_distance = float("inf")
        min_point = None
        for p in self.points:
            if self.within_x_range(p.x) and self.within_y_range(p.y):
                if not squared:
                    d = p.get_euclidean_distance(point)
                else:
                    d = p.get_px_distance_squared(point)
                if d < min_distance:
                    min_distance = d
                    min_point = p

        return min_distance, min_point

    # returns the distance and the point
    def closest_point_to_x(self, x):
        """Return the distance to the closest point and a Point instance.

        Args:
            x: a value in the range of the x axis.

        Returns:
            float, Point:
            minDistance: the absolute distance between x and the point, or
                         float('inf') if no point exists.
            minPoint: the closest Point to x, or None if no point exists.
        """
        min_distance = float("inf")
        min_point = None
        for p in self.points:
            if self.within_y_range(p.y):
                d = p.get_x_distance(x)
                if d < min_distance:
                    min_distance = d
                    min_point = p

        return min_distance, min_point

    def closest_point_to_y(self, y):
        """Return the distance to the closest point and a Point instance.

        Args:
            y: a value in the range of the y axis.

        Returns:
            float, Point:
            minDistance: the absolute distance between y and the point, or
                         float('inf') if no point exists.
            minPoint: the closest Point to x, or None if no point exists.
        """
        min_distance = float("inf")
        min_point = None
        for p in self.points:
            if self.within_x_range(p.x):
                d = p.get_y_distance(y)
                if d < min_distance:
                    min_distance = d
                    min_point = p
        return min_distance, min_point
