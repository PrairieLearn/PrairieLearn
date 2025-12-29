import math

import numpy as np

from grading.utils import collapse_ranges, point_ltgt_function, point_on_function

from .Gradeable import Gradeable
from .Point import Point
from .Tag import Tag


class LineSegments(Gradeable):  # noqa: PLR0904
    def __init__(self, info, tolerance=dict()):
        super().__init__(info, tolerance)

        self.set_default_tolerance(
            "line_distance", info["grader"]["tolerance"]
        )  # consider an line segment to be at a value if it is within tolerance pixels
        self.set_default_tolerance(
            "line_distance_squared",
            info["grader"]["tolerance"] * info["grader"]["tolerance"],
        )
        self.set_default_tolerance("line_angle", 10)
        self.set_default_tolerance("pixel", info["grader"]["tolerance"])
        self.set_default_tolerance("extrema", 20)
        self.set_default_tolerance("comparison", 20)
        self.set_default_tolerance("min_percent_overlap", 0.1)
        self.set_default_tolerance("max_percent_overlap", 0.95)

        self.segments = []
        toolid = info["grader"]["currentTool"]
        submission_data = info["submission"]["gradeable"][toolid]
        for spline in submission_data:
            if len(spline["spline"]) == 4 and self.isALine(spline["spline"]):
                seg = self.value_from_spline(spline["spline"])
                if "tag" in spline:
                    seg.set_tag(spline["tag"])
                self.segments.append(seg)
            elif len(spline["spline"]) > 4:
                # polyline data
                segs = self.value_from_polyline(spline["spline"])
                for seg in segs:
                    if "tag" in spline:
                        seg.set_tag(spline["tag"])
                self.segments.extend(segs)
            else:
                # TODO - throw error if try to grade non line seg splines
                raise ValueError(
                    "This spline does not appear to be a line segment: "
                    + str(spline["spline"])
                )

        self.set_tagables(None)
        if len(self.segments) > 0:
            self.set_tagables(self.segments)

    def isALine(self, spline):
        # compute R^2 fitness of a straight line return true if > .99
        xs = [x for x, y in spline]
        ys = [y for x, y in spline]

        _, res, _, _, _ = np.polyfit(xs, ys, 1, full=True)

        ybar = np.sum(ys) / len(ys)
        sstot = np.sum((ys - ybar) ** 2)
        if sstot == 0 or len(res) == 0:
            # sstot == 0 means horizontal line, len(res) == 0 means vertical line
            return True
        else:
            r2 = (sstot - res) / sstot

        return r2[0] > 0.99

    def value_from_spline(self, spline):
        point1 = Point(self, spline[0][0], spline[0][1])
        point2 = Point(self, spline[3][0], spline[3][1])

        return LineSegment(point1, point2)

    def value_from_polyline(self, spline):
        segs = []
        points = []
        while len(spline):
            p = spline.pop(0)
            points.append(p)
            if len(points) == 4:
                p1 = Point(self, points[0][0], points[0][1])
                p2 = Point(self, points[3][0], points[3][1])
                segs.append(LineSegment(p1, p2))
                points = [points[-1]]
        return segs

    # Grader Functions ###

    def get_range_defined(self):
        xrange = []
        for segment in self.segments:
            segment = self.cut_segment_to_y(segment)
            ep1 = segment[0]
            ep2 = segment[1]
            x1, x2 = self.swap(ep1[0], ep2[0])
            xrange.append([x1, x2])
        return collapse_ranges(xrange)

    def is_increasing_between(self, xmin, xmax):
        segments = self.get_segments_between_strict(xmin, xmax)
        if len(segments) == 0:
            if self.debug:
                self.debugger.add("Line not within range.")
            return "ndef"
        for seg in segments:
            p1 = seg.getStartPoint()
            p2 = seg.getEndPoint()
            if not self.within_y_range(p1[1]) and not self.within_y_range(p2[1]):
                continue
            start = p1 if p1[0] < p2[0] else p2
            end = p1 if p1[0] > p2[0] else p2
            if end[1] <= start[1]:
                if self.debug:
                    self.debugger.add("Direct endpoint comparison:")
                    self.debugger.add(f"Start point: {start}")
                    self.debugger.add(f"End point: {end}")
                    self.debugger.add("Start point is higher than end point.")
                return False
        return True

    def is_decreasing_between(self, xmin, xmax):
        segments = self.get_segments_between_strict(xmin, xmax)
        if len(segments) == 0:
            if self.debug:
                self.debugger.add("Line not within range.")
            return "ndef"
        for seg in segments:
            p1 = seg.getStartPoint()
            p2 = seg.getEndPoint()
            if not self.within_y_range(p1[1]) and not self.within_y_range(p2[1]):
                continue
            start = p1 if p1[0] < p2[0] else p2
            end = p1 if p1[0] > p2[0] else p2
            if end[1] >= start[1]:
                if self.debug:
                    self.debugger.add("Direct endpoint comparison:")
                    self.debugger.add(f"Start point: {start}")
                    self.debugger.add(f"End point: {end}")
                    self.debugger.add("End point is higher than start point.")
                return False
        return True

    def matches_function(self, func, x1, x2, tolerance):
        segments = self.get_segments_between_strict(x1, x2)
        if len(segments) == 0:
            if self.debug:
                self.debugger.add("Line not within range.")
            return "ndef"
        for segment in segments:
            p1 = segment.getStartPoint()
            p2 = segment.getEndPoint()
            p1, p2 = self.swap(p1, p2)
            start_x = max(p1[0], x1)
            end_x = min(p2[0], x2)
            rg = end_x - start_x
            interval = rg / 9
            hits = 0
            total = 0
            for i in range(10):  # need 4 out of 5 hits to be considered
                x = x1 + i * interval
                y = self.get_y_value_at_x(segment, x)
                if point_on_function(self, [x, y], func, tolerance):
                    hits += 1
                total += 1
            return hits == total  # general estimate

    def lt_function(self, func, x1, x2, tolerance):
        return self.ltgt_func(func, x1, x2, tolerance, greater=False)

    def gt_function(self, func, x1, x2, tolerance):
        return self.ltgt_func(func, x1, x2, tolerance, greater=True)

    # check that each in-range segment is lt or gt the function
    def ltgt_func(self, func, x1, x2, tolerance, greater):
        segments = self.get_segments_between_strict(x1, x2)
        if len(segments) == 0:
            if self.debug:
                self.debugger.add("Line not within range.")
            return "ndef"
        for segment in segments:
            p1 = segment.getStartPoint()
            p2 = segment.getEndPoint()
            p1, p2 = self.swap(p1, p2)
            start_x = max(p1[0], x1)
            end_x = min(p2[0], x2)
            rg = end_x - start_x
            interval = rg / 9
            for i in range(10):
                x = start_x + i * interval
                y = self.get_y_value_at_x(segment, x)
                if not point_ltgt_function(self, [x, y], func, greater, tolerance):
                    return False
        return True

    def has_value_at(self, y, x, tolerance=None):
        if x is None:
            return self.defined_at_y(y, tolerance)
        if y is None:
            return self.defined_at_x(x, tolerance)
        return self.has_value_y_at_x(
            y, x, yTolerance=tolerance, xTolerance=tolerance / 2
        )

    def defined_at_x(self, x, tolerance):
        endpoints = []
        for segment in self.segments:
            cut_segment = self.cut_segment_to_y(segment)
            start = cut_segment[0]
            end = cut_segment[1]
            if x >= start[0] and x <= end[0]:  # check if y exists on this range
                return True
            endpoints.extend((start[0], end[0]))
        xvals_left = [xval for xval in endpoints if xval <= x]
        xvals_left.append(float("-inf"))
        xvals_right = [xval for xval in endpoints if xval >= x]
        xvals_right.append(float("inf"))
        closest = [np.max(xvals_left), np.min(xvals_right)]

        tol = tolerance / self.xscale
        # compare closest values
        if abs(closest[0] - x) <= tol or abs(closest[1] - x) <= tol:
            return True
        if self.debug:
            self.debugger.add(
                f"Line is {min(abs(c - x) for c in closest if c != float('-inf')) * self.xscale} pixels away from x = {x}."
            )
            self.debugger.add(f"Max allowed is {tolerance} pixels.")

    def defined_at_y(self, y, tolerance):
        endpoints = []
        for segment in self.segments:
            p1 = segment.getStartPoint()
            p2 = segment.getEndPoint()
            p1, p2 = self.swap(p1, p2)
            if (
                self.within_x_range(p1[0])
                and self.within_x_range(p2[0])
                and self.between(y, p1[1], p2[1])
            ):
                return True
            endpoints.extend((segment.getStartPoint(), segment.getEndPoint()))
        endpoints = [
            point[1]
            for point in endpoints
            if self.within_x_range(point[0]) and self.within_y_range(point[1])
        ]
        yvals_below = [yval for yval in endpoints if yval <= y]
        yvals_below.append(float("-inf"))
        yvals_above = [yval for yval in endpoints if yval >= y]
        yvals_above.append(float("inf"))
        closest = [np.max(yvals_below), np.min(yvals_above)]

        yrange = self.yaxis.domain
        height = self.yaxis.pixels
        scale = abs(yrange[0] - yrange[1]) / height
        tol = tolerance * scale
        if abs(closest[0] - y) <= tol or abs(closest[1] - y) <= tol:
            return True
        if self.debug:
            self.debugger.add(
                f"Line is {min(abs(c - y) for c in closest if c != float('-inf')) * self.yscale} pixels away from y = {y}."
            )
            self.debugger.add(f"Max allowed is {tolerance} pixels.")

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
            yTolerance = self.tolerance["pixel"] / self.yscale
        else:
            yTolerance /= self.yscale
        if xTolerance is None:
            xTolerance = self.tolerance["pixel"] / self.xscale
        else:
            xTolerance /= self.xscale

        segments = self.get_segments_at(x=x, distTolerance=xTolerance)
        if not segments:
            if self.debug:
                self.debugger.add(f"Line does not exist at x = {x}.")
            return False
        for segment in segments:
            # check if any of the returned segments has the give y value within tolerances
            # if yes, return true else return false
            ymax = self.get_y_value_at_x(segment, x + xTolerance)
            ymin = self.get_y_value_at_x(segment, x - xTolerance)

            ymin, ymax = self.swap(ymin, ymax)
            if (ymax > y - yTolerance) and (ymin < y + yTolerance):
                return True
            if self.debug:
                if ymax < y:
                    self.debugger.add(
                        f"Line is {abs(y - ymax) * self.yscale} pixels away from expected point."
                    )
                else:
                    self.debugger.add(
                        f"Line is {abs(y - ymin) * self.yscale} pixels away from expected point."
                    )
                self.debugger.add(f"Max allowed is {yTolerance * self.yscale} pixels.")

        return False

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
                self.debugger.add("Line not within range.")
            return "ndef"
        else:
            if self.get_min_value_between(xmin, xmax) > y - tolerance:
                return True
            if self.debug:
                self.debugger.add(
                    f"Line is less than y = {y} by {(y - min_val) * self.yscale} pixels."
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
                self.debugger.add("Line not within range.")
            return "ndef"
        else:
            if max_val < y + tolerance:
                return True
            if self.debug:
                self.debugger.add(
                    f"Line is greater than y = {y} by {(max_val - y) * self.yscale} pixels."
                )
                self.debugger.add(f"Max allowed is {tolerance * self.yscale} pixels.")

    def check_eps(self, point, mode, tolerance):
        for segment in self.segments:
            match mode:
                case "either":
                    return self.check_segment_endpoint(
                        segment, point, tolerance
                    ) or self.check_segment_startpoint(segment, point, tolerance)
                case "start":
                    return self.check_segment_startpoint(segment, point, tolerance)
                case "end":
                    return self.check_segment_endpoint(segment, point, tolerance)
                case _:
                    return False

    def check_segment_endpoint(
        self,
        segment,
        point,
        tolerance=None,
        squared=False,
    ):
        """Return whether the segment has its end point at the point (x,y).

        Args:
            segment: the line segment to check
            point: a list [x, y] defining the point to check
            tolerance: the square of the distance in pixels
        Returns:
            bool:
            true if the segment's end point is at (x,y) within tolerances,
            otherwise false.
        """
        if tolerance is None:
            tolerance = self.tolerance["line_distance_squared"]

        point = Point(self, point[0], point[1], pixel=False)
        end = segment.end

        if squared:
            distance = end.get_px_distance_squared(point)
            if distance <= tolerance:
                return True
            if self.debug:
                self.debugger.add(
                    f"End point is {distance} pixels away from expected point."
                )
                self.debugger.add(f"Max allowed is {tolerance} pixels.")
        else:
            distance = end.get_euclidean_distance(point)
            if distance <= tolerance:
                return True
            if self.debug:
                self.debugger.add(
                    f"End point is {distance} pixels away from expected point."
                )
                self.debugger.add(f"Max allowed is {tolerance} pixels.")

    def check_segment_startpoint(self, segment, point, tolerance=None, squared=False):
        """Return whether the segment has its start point at the point (x,y).

        Args:
            segment: the line segment to check
            point: a list [x, y] defining the point to check
            tolerance: the square of the distance in pixels
        Returns:
            bool:
            true if the segment's start point is at (x,y) within tolerances,
            otherwise false.
        """
        if tolerance is None:
            tolerance = self.tolerance["line_distance_squared"]
        x, y = point
        point = Point(self, x, y, pixel=False)
        start = segment.start

        if squared:
            distance = start.get_px_distance_squared(point)
            if distance <= tolerance:
                return True
            if self.debug:
                self.debugger.add(
                    f"Start point is {distance} pixels away from expected point."
                )
                self.debugger.add(f"Max allowed is {tolerance}.")
        else:
            distance = start.get_euclidean_distance(point)
            if distance <= tolerance:
                return True
            if self.debug:
                self.debugger.add(
                    f"Start point is {round(distance, 3)} pixels away from expected point."
                )
                self.debugger.add(f"Max allowed is {tolerance}.")

    def match_length(self, expected_length, tolerance):
        """Return whether the length of all line segments combined matches the expected length.

        Args:
            segment: the line segment to check
        Returns:
            int:
            the length of the line segment
        """
        total_length_px = []
        total_length_graph = []
        if len(self.segments) == 0:
            if self.debug:
                self.debugger.add("Line not within range.")
            return "ndef"
        for segment in self.segments:
            total_length_px.append(self.get_segment_length(segment, pixel=True))
            total_length_graph.append(self.get_segment_length(segment, pixel=False))
        for i in range(len(total_length_px)):
            expected_length_px = (
                total_length_px[i] * expected_length
            ) / total_length_graph[i]
            if not abs(expected_length_px - total_length_px[i]) <= tolerance:
                if self.debug:
                    self.debugger.add(
                        f"Submitted length {round(total_length_graph[i], 3)} differs from expected length {expected_length} by {round(abs(expected_length_px - total_length_px[i]), 3)} pixels."
                    )
                    self.debugger.add(f"Max allowed is {tolerance} pixels.")
                return False
        return True

    def get_segment_length(self, segment, pixel=False):
        """Return the length of the line segment.

        Args:
            segment: the line segment to check
        Returns:
            int:
            the length of the line segment
        """
        dx = (segment.start.x - segment.end.x) * (self.xscale if pixel else 1)
        dy = (segment.start.y - segment.end.y) * (self.yscale if pixel else 1)

        return math.sqrt(dx**2 + dy**2)

    def match_angle(self, angle, allow_flip, tolerance):
        angle = angle % 360
        expected_angle = angle * math.radians(1)
        if len(self.segments) == 0:
            if self.debug:
                self.debugger.add("Line not found.")
            return "ndef"
        all_angles = [self.get_segment_angle(segment) for segment in self.segments]
        if not allow_flip:
            if all(
                (abs(expected_angle - a) <= tolerance * math.radians(1))
                or (
                    (2 * math.pi - abs(expected_angle - a))
                    <= tolerance * math.radians(1)
                )
                for a in all_angles
            ):
                return True
            if self.debug:
                no_pass = [
                    a / math.radians(1)
                    for a in all_angles
                    if not (abs(expected_angle - a) <= tolerance * math.radians(1))
                    or (
                        (2 * math.pi - abs(expected_angle - a))
                        <= tolerance * math.radians(1)
                    )
                ]
                no_pass_diffs = [
                    min(abs(angle - a), (360 - abs(angle - a))) for a in no_pass
                ]
                self.debugger.add(
                    f"Submitted angle {round(no_pass[0], 3)} degrees differs from the expected angle {angle} by {round(no_pass_diffs[0], 3)} degrees."
                )
                self.debugger.add(f"Max allowed difference is {tolerance} degrees.")
        else:
            # check the angle if the endpoints are swapped (expected_angle + 180 degrees)
            if expected_angle < math.pi:
                alt_angle = expected_angle + math.pi
            else:
                alt_angle = expected_angle - math.pi
            if all(
                (
                    (abs(expected_angle - a) <= tolerance * math.radians(1))
                    or
                    # case for if the expected angle is close to 360/0
                    (
                        (2 * math.pi - abs(expected_angle - a))
                        <= tolerance * math.radians(1)
                    )
                    or
                    # case for if the submitted is the same as the alt angle
                    (abs(alt_angle - a) <= tolerance * math.radians(1))
                )
                or
                # case for if the expected angle is close to 360/0
                ((2 * math.pi - abs(alt_angle - a)) <= tolerance * math.radians(1))
                for a in all_angles
            ):
                return True
            if self.debug:
                no_pass = [
                    a / math.radians(1)
                    for a in all_angles
                    if not (
                        (abs(expected_angle - a) <= tolerance * math.radians(1))
                        or
                        # case for if the expected angle is close to 360/0
                        (
                            (2 * math.pi - abs(expected_angle - a))
                            <= tolerance * math.radians(1)
                        )
                        or
                        # case for if the submitted is the same as the alt angle
                        (abs(alt_angle - a) <= tolerance * math.radians(1))
                    )
                    or
                    # case for if the expected angle is close to 360/0
                    ((2 * math.pi - abs(alt_angle - a)) <= tolerance * math.radians(1))
                    for a in all_angles
                ]
                no_pass_diffs = [
                    min(
                        abs(angle - a),
                        (360 - abs(angle - a)),
                        abs(alt_angle / math.radians(1) - a),
                        (360 - abs(alt_angle / math.radians(1) - a)),
                    )
                    for a in no_pass
                ]
                self.debugger.add(
                    f"Submitted angle {round(no_pass[0], 3)} degrees differ from the expected angle {angle} by {round(no_pass_diffs[0], 3)} degrees with allow-flip."
                )
                self.debugger.add(f"Max allowed difference is {tolerance} degrees.")

    def get_segment_angle(self, segment):
        """Return the angle of the line segment in radians (non-negative).

        Args:
            segment: the line segment to check
        Returns:
            float:
            the angle of the line segment in radians
        """
        pt1 = segment.start
        pt2 = segment.end
        angle = np.arctan2(pt2.y - pt1.y, pt2.x - pt1.x)
        if angle < 0:
            angle = math.pi - (-1 * math.pi - angle)
        return angle

    # Helper Functions ###

    def get_y_value_at_x(self, segment, x):
        # get the y value of the given segment at the given x position
        startX = segment.start.x
        startY = segment.start.y
        endX = segment.end.x
        endY = segment.end.y

        segSlope = self.slope(startX, startY, endX, endY)
        segInt = self.intercept(startX, startY, segSlope)

        return (segSlope * x) + segInt

    def get_x_value_at_y(self, segment, y):
        # get the y value of the given segment at the given x position
        startX = segment.start.x
        startY = segment.start.y
        endX = segment.end.x
        endY = segment.end.y

        segSlope = self.slope(startX, startY, endX, endY)

        return (y - startY) / segSlope + startX

    def get_y_value_at_x_all(self, x):
        # get the y value of the given segment at the given x position
        yvals = []
        for segment in self.segments:
            end = segment.getEndPoint()
            start = segment.getStartPoint()
            if self.between(x, end[0], start[0]):  # check if y exists on this range
                y = self.get_y_value_at_x(x=x, segment=segment)
                if y and self.within_y_range(y):
                    yvals.append(y)
        return yvals

    def does_not_exist_between(self, xmin, xmax, tolerance):
        """Return whether the function has no values defined in the range
           xmin to xmax.

        Args:
            xmin: the minimum x-axis value of the range to test.
            xmax: the maximum x-axis value of the range to test.

        Returns:
            bool:
            true if no line segments overlap with the range (xmin, xmax)
            within tolerances, otherwise false.
        """
        overlap_tolerance = tolerance

        for segment in self.segments:
            if self.segment_within_y_range_between_x(segment, xmin, xmax, neg_tol=10):
                overlap = self.get_overlap_length(segment, xmin, xmax)
                overlap_percentage = self.get_percent_overlap_of_range(
                    segment, xmin, xmax
                )
                if overlap_percentage == 1:
                    return False
                if overlap > overlap_tolerance:
                    return False

        return True

    def does_exist_between(self, xmin, xmax):
        """Return whether the function has values defined in the range xmin
           to xmax.

        Args:
            xmin: the minimum x-axis value of the range to test.
            xmax: the maximum x-axis value of the range to test.

        Returns:
            bool:
            true if at least one line segment overlaps with the range xmin
            to xmax within tolerances, otherwise false.
        """
        # tolerances should shrink the range slightly so make it negative
        dist_tolerance = self.tolerance["line_distance"] / self.xscale

        for segment in self.segments:
            overlap = self.get_overlap_length(segment, xmin, xmax)
            if overlap > dist_tolerance:
                return True

        return False

    def seg_between_vals(self, segment, xmin, xmax):
        p1 = segment.getEndPoint()
        p2 = segment.getStartPoint()
        p1, p2 = self.swap(p1, p2)
        xleft = max(xmin, p1[0])
        xright = min(xmax, p2[0])

        return xleft, xright

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
        segments = self.get_segments_between(xmin, xmax)
        minVals = []
        for segment in segments:
            _, starty = segment.getStartPoint()
            _, endy = segment.getEndPoint()
            val = np.min([starty, endy])
            minVals.append(val)

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
        segments = self.get_segments_between(xmin, xmax)
        maxVals = []
        for segment in segments:
            _, starty = segment.getStartPoint()
            _, endy = segment.getEndPoint()
            val = np.max([starty, endy])
            maxVals.append(val)

        if maxVals:
            return np.max(maxVals)
        else:
            return None

    def get_segments_between(self, xmin, xmax):
        """Return a list of line segments that exist between the given x values.

        Args:
           xmin: the minimum x coordinate of interest.
           xmax: the maximum x coordinate of interest.
        """
        tolerance = self.tolerance["pixel"] / self.xscale

        segmentsBetween = []
        for segment in self.segments:
            x0 = segment.start.x
            x1 = segment.end.x
            x0, x1 = self.swap(x0, x1)
            # NOTE: changed this to include segments that are between two points but not overlapping
            if (
                self.x_is_between(xmin, x0, x1, tolerance)
                or self.x_is_between(xmax, x0, x1, tolerance)
                or (
                    self.x_is_between(x0, xmin, xmax, tolerance)
                    and self.x_is_between(x1, xmin, xmax, tolerance)
                )
            ) and self.segment_within_y_range_between_x(
                segment, xmin, xmax, neg_tol=10
            ):
                segmentsBetween.append(segment)

        return segmentsBetween

    def get_segments_between_strict(self, xmin, xmax):
        """Return a list of line segments that exist between the given x values.

        Args:
           xmin: the minimum x coordinate of interest.
           xmax: the maximum x coordinate of interest.
        """
        tolerance = 3

        segmentsBetween = []
        for segment in self.segments:
            x0 = segment.start.x
            x1 = segment.end.x
            x0, x1 = self.swap(x0, x1)
            if (
                self.x_is_between(xmin, x0, x1, tolerance)
                or self.x_is_between(xmax, x0, x1, tolerance)
                or (
                    self.x_is_between(x0, xmin, xmax, tolerance)
                    and self.x_is_between(x1, xmin, xmax, tolerance)
                )
            ):
                segmentsBetween.append(segment)

        segmentsBetweenStrict = []
        for segment in segmentsBetween:
            if self.get_percent_overlap_of_range(
                segment, xmin, xmax
            ) > 0.10 and self.segment_within_y_range_between_x(
                segment, xmin, xmax
            ):  # NOTE: test this value
                segmentsBetweenStrict.append(segment)

        return segmentsBetweenStrict

    def get_percent_overlap_of_range(self, segment, xmin, xmax):
        # make sure start and min are less than end and max
        xmin, xmax = self.swap(xmin, xmax)

        if xmax - xmin == 0.0:
            return 0.0

        range_length = xmax - xmin
        overlap = self.get_overlap_length(segment, xmin, xmax)
        return overlap / range_length

    def get_overlap_length(self, segment, xmin, xmax):
        segment = self.cut_segment_to_y(segment)
        x1 = segment[0][0]
        x2 = segment[1][0]
        x1, x2 = self.swap(x1, x2)

        overlap = min(x2, xmax) - max(x1, xmin)
        overlap = max(overlap, 0.0)
        return overlap

    def cut_segment_to_y(self, segment):
        yrange = self.yaxis.domain
        endpoints = self.swap_eps(segment.getStartPoint(), segment.getEndPoint())
        if endpoints[0][1] < yrange[1]:
            endpoints[0][1] = yrange[1]
            endpoints[0][0] = self.get_x_value_at_y(segment, yrange[1])
        if endpoints[1][1] < yrange[1]:
            endpoints[1][1] = yrange[1]
            endpoints[1][0] = self.get_x_value_at_y(segment, yrange[1])
        if endpoints[0][1] > yrange[0]:
            endpoints[0][1] = yrange[0]
            endpoints[0][0] = self.get_x_value_at_y(segment, yrange[0])
        if endpoints[1][1] > yrange[0]:
            endpoints[1][1] = yrange[0]
            endpoints[1][0] = self.get_x_value_at_y(segment, yrange[0])
        return endpoints

    def segment_within_y_range(self, segment, neg_tol=0):
        endpoints = self.swap_eps(segment.getStartPoint(), segment.getEndPoint())
        yvals = endpoints[0][1], endpoints[1][1]
        return bool(
            self.within_y_range(yvals[0], neg_tol)
            or self.within_y_range(yvals[1], neg_tol)
        )

    def segment_within_y_range_between_x(self, segment, x1, x2, neg_tol=0):
        endpoints = self.swap_eps(segment.getStartPoint(), segment.getEndPoint())

        x1, x2 = self.seg_between_vals(segment, x1, x2)
        endpoint_yvals = endpoints[0][1], endpoints[1][1]
        xrange_yvals = (
            self.get_y_value_at_x(segment, x1),
            self.get_y_value_at_x(segment, x2),
        )
        new_y1 = None
        new_y2 = None
        # start x value
        if xrange_yvals[0] is not None:
            if (
                x1 > endpoints[0][0]
            ):  # compare start x values, choose y value at higheset x value
                new_y1 = xrange_yvals[0]
            else:
                new_y1 = endpoint_yvals[0]
        else:
            new_y1 = endpoint_yvals[0]
        # end x value
        if xrange_yvals[1] is not None:
            if (
                x2 < endpoints[1][0]
            ):  # compare start x values, choose y value at lowest x value
                new_y2 = xrange_yvals[1]
            else:
                new_y2 = endpoint_yvals[1]
        else:
            new_y2 = endpoint_yvals[1]

        return (
            self.within_y_range(new_y1, negative_tolerance=neg_tol)
            or self.within_y_range(new_y2, negative_tolerance=neg_tol)
        )  # Hardcoded tolerance for how much it can be within the yrange to be considered outside

    # Minor Helper Functions ###

    def swap(self, x1, x2):
        if x1 > x2:
            temp = x1
            x1 = x2
            x2 = temp
        return (x1, x2)

    def swap_eps(self, p1, p2):
        if p1[0] > p2[0]:
            return p2, p1
        else:
            return p1, p2

    def x_is_between(self, x, xmin, xmax, tolerance):
        xmin -= tolerance
        xmax += tolerance
        return x >= xmin and x <= xmax

    # some vector helper functions
    def dot(self, v, w):
        x, y = v
        X, Y = w
        return x * X + y * Y

    def length(self, v):
        x, y = v
        return math.sqrt(x * x + y * y)

    def vector(self, b, e):
        x, y = b
        X, Y = e
        return (X - x, Y - y)

    def unit(self, v):
        x, y = v
        mag = self.length(v)
        return (x / mag, y / mag)

    def distance(self, p0, p1):
        return self.length(self.vector(p0, p1))

    def scale(self, v, sc):
        x, y = v
        return (x * sc, y * sc)

    def add(self, v, w):
        x, y = v
        X, Y = w
        return (x + X, y + Y)

    def slope(self, x0, y0, x1, y1):
        if x1 == x0:
            return float("inf")
        return (y1 - y0) / (x1 - x0)

    def intercept(self, x, y, m):
        return y - (m * x)

    def between(self, val, start, end):
        if start > end:
            return val <= start and val >= end
        else:
            return val <= end and val >= start

    # Other Functions from SketchResponse ###

    def has_slope_m_at_x(self, m, x, ignoreDirection=True, tolerance=None):
        """Return whether the function has slope m at the value x.

        Args:
            m: the slope value to test against.
            x: the position on the x-axis to test against.
            ignoreDirection (default: true): ignore segment direction
            tolerance: the angle tolerance in degrees
        Returns:
            bool:
            true if the function at value x has slope m within tolerances,
            otherwise false.
        """
        if tolerance is None:
            tolerance = self.tolerance["line_angle"] * math.radians(1)
        else:
            tolerance *= math.radians(1)

        dist_tolerance = self.tolerance["line_distance"] / self.xscale

        if ignoreDirection:
            expectedAngle = np.arctan((self.yscale * m) / self.xscale)
        else:
            expectedAngle = np.arctan2(self.yscale * m, self.xscale * 1)
        for segment in self.segments:
            pt1 = segment.start
            pt2 = segment.end
            x1 = pt1.x
            x2 = pt2.x
            x1, x2 = self.swap(x1, x2)
            if self.x_is_between(x, x1, x2, dist_tolerance):
                # this segment crosses x
                ydiff = pt2.y - pt1.y
                xdiff = pt2.x - pt1.x
                if ignoreDirection:
                    actualAngle = np.arctan(ydiff / xdiff)
                else:
                    actualAngle = np.arctan2(ydiff, xdiff)
                return abs(expectedAngle - actualAngle) < tolerance

        return False

    def has_angle_t_at_x(self, t, x, ignoreDirection=True, tolerance=None):
        """Return whether the line segment at position x has an angle of t
           wrt the x axis.

        Args:
            t: the angle in radians
            x: the position on the x-axis to test against.
            ignoreDirection (default: true): ignore segment direction
            tolerance: the angle tolerance in degrees
        Returns:
            bool:
            true if the function at value x has angle t within tolerances,
            otherwise false.
        """
        if tolerance is None:
            tolerance = self.tolerance["line_angle"] * math.radians(1)
        else:
            tolerance = tolerance * math.radians(1)

        dist_tolerance = self.tolerance["line_distance"] / self.xscale

        for segment in self.segments:
            pt1 = segment.start
            pt2 = segment.end
            x1 = pt1.x
            x2 = pt2.x
            x1, x2 = self.swap(x1, x2)
            if self.x_is_between(x, x1, x2, dist_tolerance):
                # this segment crosses x
                ydiff = pt2.y - pt1.y
                xdiff = pt2.x - pt1.x
                if ignoreDirection:
                    actualAngle = np.arctan(ydiff / xdiff)
                else:
                    actualAngle = np.arctan2(ydiff, xdiff)
                return abs(t - actualAngle) < tolerance

        return False

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
        segments = self.get_segments_between(xmin, xmax)
        if len(segments) == 0:
            return False

        percentOfRangeWithValueY = 0.0
        for segment in segments:
            if self.segment_has_constant_value_y(segment, y):
                percentOfRangeWithValueY += self.get_percent_overlap_of_range(
                    segment, xmin, xmax
                )
        return percentOfRangeWithValueY > 0.95

    def segment_has_constant_value_y(self, segment, y):
        """Return whether the line segment has the constant value of y

        Args:
            segment: the line segment to check
            y: the y value to check against
        Returns:
            bool:
            true if the line segment has the constant value y within tolerances
            otherwise false
        """
        yTolerance = self.tolerance["pixel"] / self.yscale

        startY = segment.start.y
        endY = segment.end.y

        start_within_tolerance = (y < startY + yTolerance) and (y > startY - yTolerance)
        end_within_tolerance = (y < endY + yTolerance) and (y > endY - yTolerance)

        return start_within_tolerance and end_within_tolerance

    def segments_distances_to_point(self, point):
        # helper function computes the distances of each line segment to a give
        # point based on tutorial published at:
        # http://www.fundza.com/vectors/point2line/index.html
        distances = []
        for segment in self.segments:
            start = [segment.start.px, segment.start.py]
            end = [segment.end.px, segment.end.py]
            pnt = [point.px, point.py]

            seg_vector = self.vector(start, end)
            pnt_vector = self.vector(start, pnt)
            seg_len = self.length(seg_vector)
            seg_unitvec = self.unit(seg_vector)
            scaled_pnt_vector = self.scale(pnt_vector, 1.0 / seg_len)
            t = self.dot(seg_unitvec, scaled_pnt_vector)
            if t < 0.0:
                t = 0.0
            elif t > 1.0:
                t = 1.0
            nearest_pnt = self.scale(seg_vector, t)
            distances.append(self.distance(nearest_pnt, pnt_vector) ** 2)

        return distances

    def get_segments_at(
        self, point=None, x=None, y=None, distTolerance=None, squareDistTolerance=None
    ):
        """Return a list of line segments declared at the given value.

        Args:
            point(default: False): a Point instance at the value of interest.
            x(default: False): the x coordinate of interest.
            y(default: False): the y coordinate of interest.
            distTolerance(default: None): the pixel distance tolerance if
                                          only the x or y coordinate is given. If None
                                          default constant 'line_distance' is used.
            squareDistTolerance(default: None): the square pixel distance tolerance
                                          if point, or x and y are given. If
                                          None, default constant 'line_distance_squared'
                                          is used.

        Note:
           There are four use cases:
              1) point not False: use the Point instance as the target to locate segments, returning a list of segments that pass through the Point.
              2) x and y not False: use (x, y) as the target to locate segments, returning a list of segments that pass through the point (x, y).
              3) x not False: use only the x coordinate to locate segments, returning a list of segments that pass through given x value.
              4) y not False: use only the y coordinate to locate segments, returning a list of segments that pass through the given y value.

        Returns:
            list:
            a list of the line segments within tolerances of the given position
            arguments, or None
        """
        if distTolerance is None:
            if x is not None:
                distTolerance = self.tolerance["line_distance"] / self.xscale
            else:
                distTolerance = self.tolerance["line_distance"] / self.yscale
        elif x is not None:
            distTolerance /= self.xscale
        else:
            distTolerance /= self.yscale

        if squareDistTolerance is None:
            squareDistTolerance = self.tolerance["line_distance_squared"]

        if point is not None:
            close_segments = []
            distsSquared = self.segments_distances_to_point(point)
            for i, segment in enumerate(self.segments):
                if distsSquared[i] < squareDistTolerance:
                    close_segments.append(segment)

            if len(close_segments) == 0:
                close_segments = None

            return close_segments

        if y is not None and x is not None:
            point = Point(self, x, y, pixel=False)
            return self.get_segments_at(point=point)

        if x is not None:
            close_segments = []
            for segment in self.segments:
                x1 = segment.start.x
                x2 = segment.end.x
                x1, x2 = self.swap(x1, x2)
                if self.x_is_between(x, x1, x2, distTolerance):
                    close_segments.append(segment)

            if len(close_segments) == 0:
                close_segments = None

            return close_segments

        if y is not None:
            close_segments = []
            for segment in self.segments:
                y1 = segment.start.y
                y2 = segment.end.y
                y1, y2 = self.swap(y1, y2)
                if self.x_is_between(y, y1, y2, distTolerance):
                    close_segments.append(segment)

            if len(close_segments) == 0:
                close_segments = None

            return close_segments

        return None

    def has_segments_at(
        self, point=None, x=None, y=None, distTolerance=None, squareDistTolerance=None
    ):
        """Return true if one or more line segment exists at the given point, x coord,
            y coord, or combination.

        Args:
            point(default: False): a Point instance at the value of interest.
            x(default: False): the x coordinate of interest.
            y(default: False): the y coordinate of interest.
            distTolerance(default: None): the pixel distance tolerance if
                                          only the x or y coordinate is given. If None
                                          default constant 'line_distance' is used.
            squareDistTolerance(default: None): the square pixel distance tolerance
                                          if point, or x and y are given. If
                                          None, default constant 'line_distance_squared'
                                          is used.

        Note:
           There are four use cases:
              1) point not False: use the Point instance as the target to locate segments, returning a list of segments that pass through the Point.
              2) x and y not False: use (x, y) as the target to locate segments, returning a list of segments that pass through the point (x, y).
              3) x not False: use only the x coordinate to locate segments, returning a list of segments that pass through given x value.
              4) y not False: use only the y coordinate to locate segments, returning a list of segments that pass through the given y value.

        Returns:
            bool:
            true if there is at least one line segment within tolerance of the
            given position, otherwise false.
        """
        return (
            self.get_segments_at(point, x, y, distTolerance, squareDistTolerance)
            is not None
        )

    def check_both_segment_endpoints(self, segment, points, tolerance=None):
        """Return whether the segment's start and end points are both in
           the list of points.

        Args:
            segment: the line segment to check
            points: a list of [x, y] coordiates
            tolerance: the square of the distance in pixels
        Returns:
            bool:
            true if the segments start and end points are in points,
            otherwise false.
        """
        if tolerance is None:
            tolerance = self.tolerance["line_distance_squared"]

        if len(points) != 2:
            return False

        point1 = Point(self, points[0][0], points[0][1], pixel=False)
        point2 = Point(self, points[1][0], points[1][1], pixel=False)

        # check point1 and point2 are not the same
        if point1.get_px_distance_squared(point2) < tolerance:
            return False

        point1, point2 = points

        point1_match = self.check_segment_startpoint(
            segment, point1, tolerance
        ) or self.check_segment_endpoint(segment, point1, tolerance)
        point2_match = self.check_segment_startpoint(
            segment, point2, tolerance
        ) or self.check_segment_endpoint(segment, point2, tolerance)

        return point1_match and point2_match

    def get_number_of_segments(self):
        """Return the number of line segments in this grader module.

        Returns:
            int:
            the number of line segments in this grader module
        """
        return len(self.segments)

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

        segments = self.get_segments_at(x=x)
        min_val_at_x = float("inf")
        for segment in segments:
            val = self.get_y_value_at_x(segment, x)
            min_val_at_x = min(min_val_at_x, val)

        min_val_in_range = self.get_min_value_between(xmin, xmax)

        return abs(min_val_at_x - min_val_in_range) <= delta

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

        segments = self.get_segments_at(x=x)
        max_val_at_x = float("-inf")
        for segment in segments:
            val = self.get_y_value_at_x(segment, x)
            max_val_at_x = max(max_val_at_x, val)

        max_val_in_range = self.get_max_value_between(xmin, xmax)

        return abs(max_val_at_x - max_val_in_range) <= delta


class LineSegment(Tag):
    """A line segment wrapper class. Contains two Points defining the
    start point and the end point of the segment.
    """

    def __init__(self, point1, point2):
        super().__init__()
        self.start = point1
        self.end = point2

    def getStartPoint(self):
        """Return the start point of the line segment as an [x, y] pair.

        Returns:
            list:
            the [x, y] pair of the start point.
        """
        return [self.start.x, self.start.y]

    def getEndPoint(self):
        """Return the end point of the line segment as an [x, y] pair.

        Returns:
            list:
            the [x, y] pair of the end point.
        """
        return [self.end.x, self.end.y]
