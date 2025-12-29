from sympy.geometry import Line, Point, Segment, intersection
from sympy.geometry import Polygon as SymPyPolygon

from grading.utils import collapse_ranges, point_ltgt_function

from .Gradeable import Gradeable
from .LineSegment import LineSegment
from .Point import Point as SR_Point
from .Tag import Tag


class Polygons(Gradeable):  # noqa: PLR0904
    def __init__(self, info, tolerance=dict()):
        super().__init__(info, tolerance)
        self.set_default_tolerance(
            "point_distance", info["grader"]["tolerance"]
        )  # threshold for finding a point close to an x value (prev 10)
        self.polygons = []

        # self.version = self.get_plugin_version(info)
        toolid = info["grader"]["currentTool"]
        submission_data = info["submission"]["gradeable"][toolid]
        for spline in submission_data:
            if spline is not None:
                points = self.convert_to_real_points(spline["spline"])
                if len(points) > 0:
                    polygon = Polygon(
                        points
                    )  # does creating this separately create some kind of copying issue?
                    self.polygons.append(Polygon(points))
                    if "tag" in spline:
                        self.polygons[-1].set_tag(spline["tag"])

        # check the grader being used
        if info["grader"]["type"] != "match":
            for polygon in self.polygons:
                self.set_polygon_range_defined(polygon)

            self.range_defined = self.init_range_defined()

        self.set_tagables(None)
        if len(self.polygons) > 0:
            self.set_tagables(self.polygons)

    def convert_to_real_points(self, points):
        # input is a list of points [[x1,y1], [x2,y2], ...]
        # convert the points from pixel values to real values
        pointList = []
        for i, (px_x, px_y) in enumerate(points):
            # every 3rd point is a vertex of the polygon
            # version 0.1 is just the polygon vertices #Don't know if this check is needed anymore
            if i % 3 == 0:
                point = SR_Point(self, px_x, px_y)
                pointList.append((point.x, point.y))
        return pointList

    def set_polygon_range_defined(self, polygon):
        poly = SymPyPolygon(*polygon.points)
        bounds = poly.bounds
        xmin, xmax = bounds[0], bounds[2]
        if self.polygon_within_y_range(polygon):
            polygon.range_defined = [[xmin, xmax]]
        elif self.polygon_partial_within_y_range(polygon):
            xrange = self.xaxis.domain
            yrange = self.yaxis.domain
            # top boundary
            line_1 = [
                [xrange[0], yrange[1]],
                [xrange[1], yrange[1]],
            ]  # handle tolerance
            # lower boundary
            line_2 = [
                [xrange[1], yrange[0]],
                [xrange[0], yrange[0]],
            ]  # handle tolerance
            i_1 = self.get_intersections_with_polygon_boundary(polygon, line_1)
            i_2 = self.get_intersections_with_polygon_boundary(polygon, line_2)
            intersections = i_1 + i_2
            # reformat lines for cut_section function
            line_1 = Line(Point(line_1[0]), Point(line_1[1]))
            line_2 = Line(Point(line_2[0]), Point(line_2[1]))
            if len(i_1) == 0:
                upper_segment, lower_segment = poly.cut_section(line_2)
            else:
                upper_segment, lower_segment = poly.cut_section(line_1)
            if len(intersections) > 0:
                intersection_y_val = intersections[0][
                    1
                ]  # because intersections sometimes misses points
                if len(i_1) == 0:
                    new_polys = self.extract_poly_from_cut_section(
                        lower_segment, intersection_y_val
                    )
                else:
                    new_polys = self.extract_poly_from_cut_section(
                        upper_segment, intersection_y_val
                    )
            else:
                new_polys = []
            rg = []
            for p in new_polys:
                xmin, xmax = self.min_max_defined_x_vals(p)
                rg.append([xmin, xmax])
            polygon.range_defined = rg
        else:
            return

    def init_range_defined(self):
        all_ranges = []
        for polygon in self.polygons:
            all_ranges += (
                polygon.range_defined if polygon.range_defined is not None else []
            )
        rd = collapse_ranges(all_ranges)
        return rd

    # helper function for set_polygon_range_defined
    # groups the points of a cut section into separate polygons.
    def extract_poly_from_cut_section(self, section, intersection_y_val):
        points = [[p[0], p[1]] for p in section.vertices]
        intersections = [point for point in points if point[1] == intersection_y_val]
        intersections = sorted(intersections, key=lambda p: p[0])
        pgs = []

        while len(points) > 5:  # two distinct polygons must have at least 6 points
            # shuffle points list so that it starts with an intersection point
            for i in range(len(points)):
                if points[i] in intersections:
                    if i == 0:
                        break
                    points = points[i:] + points[:i]
                    break
            # get index of starting point in the intersections list
            sp_index = intersections.index(points[0])
            # shuffle points to make sure start point's partner intersection point is attainable
            # get index of start point's partner (adjacent) intersection
            if sp_index % 2 == 0:
                sp_partner = intersections[sp_index + 1]
            else:
                sp_partner = intersections[sp_index - 1]
            sp_partner_index = points.index(sp_partner)
            # if the following point is a non-partner intersection, shuffle points appropriately
            if points[1] != sp_partner and points[1] in intersections:
                # shuffle so that start isn't disconnected from the rest of its shape
                points = [
                    points[0],
                    *points[sp_partner_index:][::-1],
                    *points[1:sp_partner_index],
                ]
                # print("points shuffled to match start partner ", points)
            elif sp_partner_index == 1:
                # if the next point is the start point's partner, reverse points[1:]
                # this is because the polygon is considered complete when the partner
                # is found, and we don't want to miss the rest of the points between the intersections
                points = [points[0], *points[1:][::-1]]
                # print("reversed points list: ", points)
            for i in range(1, len(points)):
                if points[i] in intersections:
                    p = points[i]
                    p_index = intersections.index(p)
                    # if the point is the start point's partner, close polygon
                    if self.is_partner(sp_index, p_index):
                        # print("appending", points[:i + 1])
                        pgs.append(points[: i + 1])
                        points = points[i + 1 :]
                        # print("after trimming points: ", points)
                        break
                    # if the point is another intersection point, make sure it is followed
                    # by its partner to ensure correct point ordering
                    p_next = points[i + 1]
                    if p_next in intersections:
                        p_next_index = intersections.index(p_next)
                        if not self.is_partner(p_index, p_next_index):
                            if p_index % 2 == 0:
                                p_partner = intersections[p_index + 1]
                            else:
                                p_partner = intersections[p_index - 1]
                            p_partner_index = points.index(p_partner)
                            if p_partner_index > p_index:
                                points = (
                                    points[: i + 1]
                                    + points[p_partner_index:]
                                    + points[i + 1 : p_partner_index]
                                )
                                # print("points shuffled to match partner ", points)
        # append remaining points
        if len(points) != 0:
            pgs.append(points)
        return pgs

    def is_partner(self, ref_index, test_index):
        if ref_index % 2 == 0:
            return test_index == ref_index + 1
        else:
            return test_index == ref_index - 1

    def min_max_defined_x_vals(self, points):
        filtered_points = [(x, y) for x, y in points if self.within_y_range(y)]
        sorted_points = sorted(filtered_points, key=lambda x: x[0], reverse=False)
        if len(sorted_points) == 0:
            return None
        return sorted_points[0][0], sorted_points[-1][0]

    # Grader Functions ###

    def get_range_defined(self):
        return self.range_defined or []

    def is_greater_than_y_between(self, y, x1, x2, tolerance=None):
        tol = tolerance / self.yscale
        polygons = self.get_polygons_within_range(x1, x2)
        segments = []
        for p in polygons:
            segments += self.get_segments(p)
        filtered_seg = [seg for seg in segments if self.segment_in_range(seg, x1, x2)]
        cut_segs = [self.cut_segment(seg, x1, x2) for seg in filtered_seg]
        cut_segs = [seg for seg in cut_segs if seg is not None]
        points = []
        for seg in cut_segs:
            points.extend((seg.points[0], seg.points[1]))
        if len(points) == 0:
            if self.debug:
                self.debugger.add("No values found within range.")
            return "ndef"
        max_incorrect = 0
        incorrect_count = 0
        for p in points:
            if incorrect_count > max_incorrect:
                return False
            if p[1] < y - tol:
                incorrect_count += 1
                if self.debug:
                    self.debugger.add(
                        f"Point [{p.x.evalf()},{p.y.evalf()}] on polygon is less than y = {y} by {(y - p[1]) * self.yscale} pixels."
                    )
                    self.debugger.add(f"Max allowed is {tolerance} pixels.")
        return incorrect_count <= max_incorrect

    def is_less_than_y_between(self, y, x1, x2, tolerance):
        tol = tolerance / self.yscale
        polygons = self.get_polygons_within_range(x1, x2)
        segments = []
        for p in polygons:
            segments += self.get_segments(p)
        filtered_seg = [seg for seg in segments if self.segment_in_range(seg, x1, x2)]
        cut_segs = [self.cut_segment(seg, x1, x2) for seg in filtered_seg]
        cut_segs = [seg for seg in cut_segs if seg is not None]
        points = []
        for seg in cut_segs:
            points.extend((seg.points[0], seg.points[1]))
        if len(points) == 0:
            if self.debug:
                self.debugger.add("No values found within range.")
            return "ndef"
        max_incorrect = 0
        incorrect_count = 0
        for p in points:
            if incorrect_count > max_incorrect:
                return False
            if p[1] > y + tol:
                incorrect_count += 1
                if self.debug:
                    self.debugger.add(
                        f"Point [{p.x.evalf()},{p.y.evalf()}] on polygon is greater than y = {y} by {(p[1] - y) * self.yscale} pixels."
                    )
                    self.debugger.add(f"Max allowed is {tolerance} pixels.")
        return incorrect_count <= max_incorrect

    def does_not_exist_between(self, xmin, xmax, tolerance):  # tolerance in graph dist
        rd = self.range_defined if self.range_defined is not None else []
        if len(rd) == 0:
            return True
        rud = [
            [rd[i][1] + tolerance, rd[i + 1][0] - tolerance] for i in range(len(rd) - 1)
        ]
        rud.extend((
            [self.xaxis.domain[0], rd[0][0] - tolerance],
            [rd[-1][1] + tolerance, self.xaxis.domain[1] - tolerance],
        ))
        for r in rd:
            # both within defined range
            if xmin >= r[0] and xmin <= r[1] and xmax >= r[0] and xmax <= r[1]:
                return False
            # min within defined range
            if (xmin >= r[0] and xmin <= r[1]) and r[1] - xmin > tolerance:
                return False
            # max within defined range
            if (xmax >= r[0] and xmax <= r[1]) and xmax - r[0] > tolerance:
                return False
            # surrounding defined range
            if xmin < r[0] and xmax > r[1]:
                return False
        return True

    def matches_function(self, func, x1, x2, tolerance):
        rg = x2 - x1
        interval = rg / 9
        incorrect_count = 0
        max_incorrect = 2
        total = 0
        for i in range(10):  # need 8 out of 10 hits to be considered
            if incorrect_count > max_incorrect:
                return False
            x = x1 + i * interval
            try:
                y = func(x)
                if not self.contains_point(x, y, tolerance=tolerance):
                    incorrect_count += 1
            except Exception:
                continue
            total += 1
        return incorrect_count <= max_incorrect

    def lt_function(self, func, x1, x2, tolerance):
        return self.ltgt_function(func, x1, x2, False, tolerance)

    def gt_function(self, func, x1, x2, tolerance):
        return self.ltgt_function(func, x1, x2, True, tolerance)

    def ltgt_function(self, func, x1, x2, greater, tolerance):
        polygons = self.get_polygons_within_range(x1, x2)
        segments = []
        for p in polygons:
            segments += self.get_segments(p)
        filtered_seg = [seg for seg in segments if self.segment_in_range(seg, x1, x2)]
        cut_segs = [self.cut_segment(seg, x1, x2) for seg in filtered_seg]
        cut_segs = [seg for seg in cut_segs if seg is not None]
        points = []
        for seg in cut_segs:
            points.extend((seg.points[0], seg.points[1]))
        if len(points) == 0:
            if self.debug:
                self.debugger.add("No values found within range.")
            return "ndef"
        max_incorrect = 0
        incorrect_count = 0
        for p in points:
            if incorrect_count > max_incorrect:
                return False
            try:
                if not point_ltgt_function(self, p, func, greater, tolerance):
                    incorrect_count += 1
            except Exception:
                continue

        return incorrect_count <= max_incorrect

    def intersects_at_x(self, x, tolerance):
        y1, y2 = self.yaxis.domain
        line = [[x, y1], [x, y2]]
        inters = self.get_intersections_with_boundary(line)
        intersections = inters[0]
        if len(intersections) > 0:
            for p in intersections:
                if self.within_y_range(p[1]):
                    return True
        # find close-enough points.
        tol = tolerance / self.xscale
        # set up debug
        if self.debug:
            self.debugger.var1 = float("inf")  # store min distance
        for polygon in self.polygons:
            for point in polygon.points:
                if self.within_y_range(point[1]):
                    if abs(x - point[0]) < tol:
                        return True
                    if self.debug:
                        self.debugger.var1 = min(
                            self.debugger.var1, abs((x - point[0]) * self.xscale)
                        )
        if self.debug:
            self.debugger.add(
                f"Polygon is {self.debugger.var1} pixels away from x = {x}."
            )
            self.debugger.add(f"Max allowed is {tolerance} pixels.")
        return False

    def intersects_at_y(self, y, tolerance):
        x1, x2 = self.xaxis.domain
        line = [[x1, y], [x2, y]]
        inters = self.get_intersections_with_boundary(line)
        intersections = inters[0]
        if len(intersections) > 0:
            for p in intersections:
                if self.within_x_range(p[0]):
                    return True
        # find close-enough points
        tol = tolerance / self.yscale
        # set up debug
        if self.debug:
            self.debugger.var1 = float("inf")  # store min distance
        for polygon in self.polygons:
            for point in polygon.points:
                if self.within_x_range(point[0]):
                    if abs(y - point[1]) < tol:
                        return True
                    if self.debug:
                        self.debugger.var1 = min(
                            self.debugger.var1, abs((y - point[1]) * self.yscale)
                        )
        if self.debug:
            self.debugger.add(
                f"Polygon is {self.debugger.var1} pixels away from y = {y}."
            )
            self.debugger.add(f"Max allowed is {tolerance} pixels.")

        return False

    def contains_point(self, x, y, tolerance=None):
        """Return whether the given point is contained within the given
           polygon, within tolerance.

        Args:
            polygon: a list of points [[x1,y1], ..., [xn,yn]] defining a polygon,
                     or a Polygon object
            point: an list [x, y] defining a point, or
                   a Point object from a GradeableFunction grader
            tolerance: a pixel distance tolerance
        Returns:
            boolean:
            True if the point is contained within the polygon within tolerance,
            otherwise False.
        """
        if x is None:
            return self.intersects_at_y(y, tolerance)
        if y is None:
            return self.intersects_at_x(x, tolerance)

        # sympy polygon does not take a list of points, stupidly
        point_ = SR_Point(self, x, y, pixel=False)
        point = [point_.x, point_.y]

        for p in self.polygons:
            # sympy polygon does not take a list of points, stupidly
            poly = SymPyPolygon(*p.points)
            isInside = poly.encloses_point(Point(*point))
            onBoundary = self.point_is_on_polygon_boundary(
                p, point, tolerance=tolerance / self.xscale
            )
            if isInside or onBoundary:
                return p

        return None

    # Helper Functions

    # checks if polygon partially in the yrange
    def polygon_partial_within_y_range(self, polygon):  # implement tolerance
        # points = self.convert_to_real_points(polygon.points)
        points = polygon.points
        return any(self.within_y_range(point[1]) for point in points)

    # checks if polygon fully in the y range
    def polygon_within_y_range(self, polygon):  # implement tolerance
        # points = self.convert_to_real_points(polygon.points)
        points = polygon.points
        return all(self.within_y_range(point[1]) for point in points)

    def segment_in_range(self, segment, x1, x2):
        points = segment.points
        return (
            not (points[0][0] < x1 and points[1][0] <= x1)
            or (points[0][0] >= x2 and points[1][0] > x2)
        ) and (self.within_y_range(points[0][1]) or self.within_y_range(points[1][1]))

    def segment_in_range_strict(self, segment, x1, x2):
        points = segment.points
        return (
            not (points[0][0] < x1 and points[1][0] <= x1)
            or (points[0][0] >= x2 and points[1][0] > x2)
        ) and (self.within_y_range(points[0][1]) and self.within_y_range(points[1][1]))

    def cut_segment(self, segment, x1, x2):
        points = segment.points
        if points[0][0] < points[1][0]:
            p1 = points[0]
            p2 = points[1]
        else:
            p1 = points[1]
            p2 = points[0]
        p1_new = self.clip_point_on_seg(p1, segment, x1, x2)
        p2_new = self.clip_point_on_seg(p2, segment, x1, x2)
        # due to numerical innacuracies, instead of checking that the points are equal, we check that they're close within a tolerance of 1px.
        if (
            abs(p1_new[0] - p2_new[0]) <= 1 / self.xscale
            and abs(p1_new[1] - p2_new[1]) <= 1 / self.yscale
        ):
            return None
        new_seg = Segment(p1_new, p2_new)
        if self.segment_in_range_strict(new_seg, x1, x2):
            return new_seg
        return None

    def clip_point_on_seg(self, point, segment, xmin, xmax):
        yrange = self.yaxis.domain
        y1 = yrange[1]
        y2 = yrange[0]
        xval = point[0]
        yval = point[1]
        slope = None
        try:
            slope = segment.slope
        except Exception:  # slope undefined
            if yval > y2:
                return (xval, y2)
            if yval < y1:
                return (xval, y1)

        def find_y(x):
            return slope * (x - xval) + yval

        def find_x(y):
            return (y - yval) / slope + xval

        new_x = xval
        new_y = yval
        if yval > y2:
            new_y = y2
            new_x = find_x(y2)
        if yval < y1:
            new_y = y1
            new_x = find_x(y1)
        if xval > xmax:
            new_x = xmax
            new_y = find_y(xmax)
        if xval < xmin:
            new_x = xmin
            new_y = find_y(xmin)
        return (new_x, new_y)

    def get_polygon_count(self):
        """Returns the number of polygons defined in the function."""
        return len(self.polygons)

    def polygon_contains_point(self, polygon, point, tolerance=None):
        """Return whether the given point is contained within the given
           polygon, within tolerance.

        Args:
            polygon: a list of points [[x1,y1], ..., [xn,yn]] defining a polygon,
                     or a Polygon object
            point: an list [x, y] defining a point, or
                   a Point object from a GradeableFunction grader
            tolerance: a pixel distance tolerance
        Returns:
            boolean:
            True if the point is contained within the polygon within tolerance,
            otherwise False.
        """
        # sympy polygon does not take a list of points, stupidly
        if isinstance(point, SR_Point):
            point = [point.x, point.y]

        if isinstance(polygon, Polygon):
            polygon = polygon.points

        poly = SymPyPolygon(*polygon)
        isInside = poly.encloses_point(Point(*point))
        onBoundary = self.point_is_on_polygon_boundary(
            polygon, point, tolerance=tolerance
        )

        return isInside or onBoundary

    def contains_polygon(self, polygon, tolerance=None):
        """Return the polygon that contains the given polygon, within tolerance.

        Args:
            polygon: a list of points [[x1,y1], ..., [xn,yn]] defining a polygon,
                     or a Polygon object
            tolerance: a pixel distance tolerance
        Returns:
            list:
            The first polygon, defined as a list of points, that contains
            the given polygon, or None.
        """
        if isinstance(polygon, Polygon):
            polygon = polygon.points

        for p in self.polygons:
            contains = True
            for point in polygon:
                contains = contains and self.polygon_contains_point(
                    p, point, tolerance=tolerance
                )

            if contains:
                return p

        return None

    def polygon_contains_polygon(self, container, contained, tolerance=None):
        """Return whether the container polygon contains the entirety of the
           contained polygon, within tolerance.

        Args:
            container: a list of points [[x1,y1], ..., [xn,yn]] defining a polygon,
                     or a Polygon object
            contained: a list of points [[x1,y1], ..., [xn,yn]] defining a polygon,
                     or a Polygon object
            tolerance: a pixel distance tolerance
        Returns:
            list:
            True of the container polygon contains every point of the contained
            polygon, otherwise False.
        """
        if isinstance(contained, Polygon):
            contained = contained.points

        contains = True
        for point in contained:
            contains = contains and self.polygon_contains_point(
                container, point, tolerance=tolerance
            )
        return contains

    def point_is_on_boundary(self, point, tolerance=None):
        """Return the polygon on whose boundary the given point lies,
           within tolerance.

        Args:
            point: an list [x, y] defining a point, or
                   a Point object from a GradeableFunction grader
            tolerance: a pixel distance tolerance
        Returns:
            list:
            The first polygon, defined as a list of points, that contains
            the given point, or None.
        """
        if tolerance is None:
            tolerance = self.tolerance["point_distance"] / self.xscale

        if isinstance(point, SR_Point):
            point = [point.x, point.y]

        for polygon in self.polygons:
            for i, pt in enumerate(polygon.points):
                if i < len(polygon.points) - 1:
                    pt2 = polygon.points[i + 1]
                else:
                    pt2 = polygon.points[0]

                poly_seg = Segment(pt, pt2)
                distance = poly_seg.distance(Point(*point))
                if distance < tolerance:
                    return polygon
        return None

    def get_segments(self, polygon):
        segments = []
        for i, pt in enumerate(polygon.points):
            if i < len(polygon.points) - 1:
                pt2 = polygon.points[i + 1]
            else:
                pt2 = polygon.points[0]
            if pt != pt2:
                poly_seg = Segment(pt, pt2)
                segments.append(poly_seg)
        return segments

    def point_is_on_polygon_boundary(self, polygon, point, tolerance=None):
        """Return whether the given point lies on the boundary of the given
           polygon, within tolerance.

        Args:
            polygon: a list of points [[x1,y1], ..., [xn,yn]] defining a polygon,
                     or a Polygon object
            point: an list [x, y] defining a point, or
                   a Point object from a GradeableFunction grader
            tolerance: a pixel distance tolerance
        Returns:
            boolean:
            True if the point lies on the polygon boundary within tolerance,
            otherwise False.
        """
        # set up debug
        if self.debug:
            self.debugger.var1 = float("inf")

        if tolerance is None:
            tolerance = self.tolerance["point_distance"] / self.xscale

        if isinstance(point, SR_Point):
            point = [point.x, point.y]

        if isinstance(polygon, Polygon):
            polygon = polygon.points

        for i, pt in enumerate(polygon):
            if i < len(polygon) - 1:
                pt2 = polygon[i + 1]
            else:
                pt2 = polygon[0]

            poly_seg = Segment(pt, pt2)
            distance = poly_seg.distance(Point(*point))
            if distance < tolerance:
                return True
            if self.debug:
                self.debugger.var1 = min(self.debugger.var1, distance * self.xscale)
        if self.debug:
            self.debugger.add(
                f"Polygon is roughly {self.debugger.var1.evalf()} pixels away from point ({point[0]},{point[1]})."
            )
            self.debugger.add(
                f"Max allowed distance is {tolerance * self.xscale} pixels."
            )

        return False

    def get_intersections_with_boundary(self, line_segment, tolerance=None):
        """Return a list of lists of intersection points of the given
            line segment with the grader polygons.

        Args:
            line_segment: an list of two points [[x1, y1], [x2,y2]], or
                          a LineSegment object from a LineSegment grader
            tolerance: a pixel distance tolerance
        Returns:
            list:
            A list of lists of intersection points [x,y] for each polygon
            in the grader.
        """
        intersections = []
        if isinstance(line_segment, LineSegment):
            point1 = line_segment.getStartPoint()
            point2 = line_segment.getEndPoint()
        else:
            point1 = line_segment[0]
            point2 = line_segment[1]

        in_seg = Segment(Point(*point1), Point(*point2))

        for polygon in self.polygons:
            p_intersections = []
            for i, pt in enumerate(polygon.points):
                if i < len(polygon.points) - 1:
                    pt2 = polygon.points[i + 1]
                else:
                    pt2 = polygon.points[0]

                poly_seg = Segment(pt, pt2)
                intersection_points = intersection(in_seg, poly_seg)
                p_intersections.extend([ip.x, ip.y] for ip in intersection_points)

            p_intersections = self.filter_intersections_for_endpoints(
                p_intersections, point1, point2, tolerance=tolerance
            )
            intersections.append(p_intersections)

        return intersections

    def get_intersections_with_polygon_boundary(
        self, polygon, line_segment, tolerance=None
    ):
        """Return a list of intersection points of the given line segment
           with the given polygon.

        Args:
            polygon: a list of points [[x1,y1], ..., [xn,yn]] defining a polygon,
                     or a Polygon object
            line_segment: an list of two points [[x1, y1], [x2,y2]], or
                          a LineSegment object from a LineSegment grader
            tolerance: a pixel distance tolerance
        Returns:
            list:
            A list of intersection points [x,y].
        """
        intersections = []
        if isinstance(line_segment, LineSegment):
            point1 = line_segment.getStartPoint()
            point2 = line_segment.getEndPoint()
        else:
            point1 = line_segment[0]
            point2 = line_segment[1]

        if isinstance(polygon, Polygon):
            polygon = polygon.points

        in_seg = Segment(Point(*point1), Point(*point2))

        for i, pt in enumerate(polygon):
            if i < len(polygon) - 1:
                pt2 = polygon[i + 1]
            else:
                pt2 = polygon[0]

            poly_seg = Segment(pt, pt2)
            intersection_points = intersection(in_seg, poly_seg)
            intersections.extend([ip.x, ip.y] for ip in intersection_points)

        intersections = self.filter_intersections_for_endpoints(
            intersections, point1, point2, tolerance=tolerance
        )

        return intersections

    def get_polygons_within_range(self, xmin, xmax):
        polygons = []
        for polygon in self.polygons:
            range_defined = (
                polygon.range_defined if polygon.range_defined is not None else []
            )
            range_detected = False
            for r in range_defined:
                if not ((r[0] < xmin and r[1] < xmin) or (r[0] > xmax and r[1] > xmax)):
                    range_detected = True
                    break
            if range_detected:
                polygons.append(polygon)
        return polygons

    # Other Functions ###

    # Returns true of the two points are within the given distance tolerance
    # of each other.
    def point_within_tolerance(self, point1, point2, tolerance=None):
        if tolerance is None:
            tolerance = self.tolerance["point_distance"] / self.xscale

        p1 = Point(*point1)
        return p1.distance(Point(*point2)) < tolerance

    # Returns a list of intersections where all points that are within
    # tolerance of either end point of the intersecting line segment
    # are removed.
    def filter_intersections_for_endpoints(
        self, intersections, start_point, end_point, tolerance=None
    ):
        filtered = []
        for i in intersections:
            isStart = self.point_within_tolerance(start_point, i, tolerance=tolerance)
            isEnd = self.point_within_tolerance(end_point, i, tolerance=tolerance)
            if not isStart and not isEnd:
                filtered.append(i)

        return filtered


class Polygon(Tag):
    """A polygon wrapper class. Contains a list of [x, y] points defining the
    vertices of the polygon.
    """

    def __init__(self, points):
        super().__init__()
        self.points = points
        self.range_defined = None
