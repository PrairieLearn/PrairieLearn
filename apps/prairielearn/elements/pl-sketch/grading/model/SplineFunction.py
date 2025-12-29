import numpy as np

from grading.utils import collapse_ranges

from .CurveFunction import CurveFunction
from .MultiFunction import MultiFunction


# Function composed of a series of Bezier curves
class SplineFunction(MultiFunction):
    # a list of the curves: each curve is a Curve Function
    # self.functions = []

    # only provide path_info or curves, not both
    def __init__(self, xaxis, yaxis, path_info=[], functions=[], tolerance=dict()):
        super().__init__(xaxis, yaxis, path_info, tolerance)
        # self.tolerance['straight_line'] = 0.1 # threshold for straight lines
        if functions:
            self.functions = functions

        yrange = self.yaxis.domain
        ymin = yrange[1]
        ymax = yrange[0]
        xvals = []
        xvals.append([])  # each in bounds range is a list
        for function in self.functions:
            x0 = function.p0[0]
            x3 = function.p3[0]
            y0 = function.p0[1]
            y3 = function.p3[1]
            # if completely out of bounds, skip.
            if (y0 < ymin and y3 < ymin) or (y0 > ymax and y3 > ymax):
                continue
            # if fully in bounds, add and continue
            if y0 >= ymin and y0 <= ymax and y3 >= ymin and y3 <= ymax:
                xvals[-1].append(x0)
                xvals[-1].append(x3)
                continue
            # if x0 = x3, add both to the range:
            if x0 == x3:
                xvals[-1].append(x0)
                xvals[-1].append(x3)
                continue
            # if ybounds are within the function (function is partially oob), cut the domain.
            new_x = None
            if ymin > min(y0, y3) and ymin < max(y0, y3):
                new_xvals = function.get_x_for_yval(ymin)
                for x in new_xvals:
                    if x >= (min(x0, x3)) and x <= (max(x0, x3)):
                        new_x = x
                if new_x is None:
                    new_x = new_xvals[-1]
            elif ymax > min(y0, y3) and ymax < max(y0, y3):
                new_xvals = function.get_x_for_yval(ymax)
                for x in new_xvals:
                    if x >= (min(x0, x3)) and x <= (max(x0, x3)):
                        new_x = x
                if new_x is None:
                    new_x = new_xvals[-1]

            if y0 >= ymin and y0 <= ymax:
                xvals[-1].append(x0)
                xvals[-1].append(new_x)
                if x0 < x3:
                    xvals.append([])
                continue
            if y3 >= ymin and y3 <= ymax:
                xvals[-1].append(x3)
                xvals[-1].append(new_x)
                if x3 < x0:
                    xvals.append([])
                continue

        real_domain = []
        for i in range(len(xvals)):
            if len(xvals[i]) != 0:
                real_domain.append([np.min(xvals[i]), np.max(xvals[i])])
        real_domain = collapse_ranges(real_domain)
        self.domain = real_domain

    def create_from_path_info(self, path_info):
        if not path_info:
            return

        # flip left-right if necessary:
        # TODO: might not be necessary
        # TODO: do something about duplication. wait what is duplication.
        if path_info[-1][0] < path_info[0][0]:
            p_info = path_info[::-1]
        else:
            p_info = path_info[:]

        points = []
        self.functions = []
        while len(p_info):
            p = p_info.pop(0)
            points.append(p)
            if len(points) == 4:
                curve = CurveFunction(self.xaxis, self.yaxis, points)
                self.functions.append(curve)  # KEEPING CURVE??
                points = [points[-1]]

    # Function finders. may no longer be necessary.

    # find the first curve with this xval, returns the index:
    # returns -1 if the xval is to the left of all curves, -2 if it is to the right of all curves
    def find_curve(self, xval):
        for i in range(len(self.functions)):
            curve = self.functions[i]
            if curve.p0[0] <= xval and curve.p3[0] >= xval:
                return i
            if curve.p3[0] <= xval and curve.p0[0] >= xval:
                return i
        if len(self.functions) > 0:
            if xval < self.functions[i].p0[0]:
                return -1
            else:
                return -2

    # returns three arrays: the curves, the respective xmins, and the respective xmaxes
    # first xmin is the given parameter xmin, likewise for last xmax
    def find_curves_between(self, xmin, xmax):
        a = self.find_curve(xmin)
        b = self.find_curve(xmax)

        # handle cases when xmin or xmax are out of bounds
        if a == -1:
            a = 0
        elif a == -2:
            return None
        if b == -1:
            return None
        elif b == -2:
            b = len(self.functions) - 1

        curves = self.functions[a : b + 1]
        xminvals = []
        xmaxvals = []
        for curve in curves:
            xminvals.append(curve.p0[0])
            xmaxvals.append(curve.p3[0])
        xminvals[0] = max(xminvals[0], xmin)
        xmaxvals[-1] = min(xmaxvals[-1], xmax)
        return curves, xminvals, xmaxvals

    # "get" methods ##

    def get_domain(self):
        return self.domain

    def get_angle_at(self, xval):
        i = self.find_curve(xval)
        if i >= 0:
            return self.functions[i].get_angle_at(xval)
        return None

    def get_min_value_between(self, xmin, xmax):
        curves, xMinVals, xMaxVals = self.find_curves_between(xmin, xmax)
        minVals = []

        for i in range(len(curves)):
            curve = curves[i]
            minVals.append(curve.get_min_value_between(xMinVals[i], xMaxVals[i]))

        return np.min(minVals)

    def get_max_value_between(self, xmin, xmax):
        curves, xMinVals, xMaxVals = self.find_curves_between(xmin, xmax)
        maxVals = []

        for i in range(len(curves)):
            curve = curves[i]
            maxVals.append(curve.get_max_value_between(xMinVals[i], xMaxVals[i]))

        return np.max(maxVals)

    def get_closest_endpoint(self, xval=None, yval=None):
        endpoints = []
        for f in self.functions:
            endpoints += f.get_endpoints()
        min_distance = float("inf")
        closest_endpoint = []
        if xval is not None:
            for p in endpoints:
                if abs(p[0] - xval) < min_distance:
                    min_distance = abs(p[0] - xval)
                    closest_endpoint = p
        else:
            for p in endpoints:
                if abs(p[1] - yval) < min_distance:
                    min_distance = abs(p[1] - yval)
                    closest_endpoint = p
        return closest_endpoint

    # Grader functions ###

    def is_a_function(self):
        return all(curve.is_a_function() for curve in self.functions)

    def is_straight(self):
        return self.is_straight_between(
            self.functions[0].p0[0], self.functions[-1].p3[0]
        )
