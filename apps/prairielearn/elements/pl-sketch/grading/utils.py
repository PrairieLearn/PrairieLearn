import ast
import math

import numpy as np


def parse_function_string(s):
    if s is None:
        return None

    # If fun-x-y-swap is set to true, functions might be defined using y as variable name
    # This does not affect function evaluation, so we simply rename the variable before parsing
    s = s.replace("y", "x")

    node = ast.parse(s, mode="eval")

    name_whitelist = {
        "log": math.log,
        "sin": math.sin,
        "cos": math.cos,
        "tan": math.tan,
        "e": math.e,
        "pi": math.pi,
        "sqrt": math.sqrt,
        "acos": math.acos,
        "arccos": math.acos,
        "asin": math.asin,
        "arcsin": math.asin,
        "atan": math.atan,
        "arctan": math.atan,
        "atan2": math.atan2,
        "arctan2": math.atan2,
        "acosh": math.acosh,
        "asinh": math.asinh,
        "atanh": math.atanh,
        "cosh": math.cosh,
        "sinh": math.sinh,
        "tanh": math.tanh,
        "abs": math.fabs,
        "sign": lambda x: (math.fabs(x) / x),
    }

    # Safe node types
    node_whitelist = {
        ast.Expression,
        ast.Call,
        ast.BinOp,
        ast.UnaryOp,
        ast.Add,
        ast.Sub,
        ast.Mult,
        ast.Div,
        ast.Pow,
        ast.USub,
        ast.UAdd,
        ast.Name,
        ast.Load,
        ast.Constant,
    }

    for n in ast.walk(node):
        if not isinstance(n, tuple(node_whitelist)):
            raise TypeError("The 'fun' attribute contained an unsupported expression!")
        if isinstance(n, ast.Name) and n.id != "x" and n.id not in name_whitelist:
            raise ValueError(
                f"The 'fun' attribute contained an unsupported function or variable name!: {n.id}"
            )

    code = compile(node, "<string>", mode="eval")

    return lambda x: eval(code, {"__builtins__": None, **name_whitelist}, {"x": x})


def collapse_ranges(ranges):
    all_ranges = ranges
    if len(ranges) == 1:
        return ranges
    sorted_ranges = sorted(all_ranges, key=lambda x: x[0], reverse=False)
    xrange = []
    highest_end = None
    for i in range(len(sorted_ranges)):
        if i == 0:
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


def function_to_spline(f, xrange, range_data):
    x_min, x_max = xrange[0], xrange[1]
    if x_min > x_max:
        return [], False, None
    spline = []

    # set up values that are needed to convert the coordinates from graph to screen coordinates
    x_start = range_data["x_start"]
    x_end = range_data["x_end"]
    y_start = range_data["y_start"]
    y_end = range_data["y_end"]
    width = range_data["width"]
    height = range_data["height"]

    # TODO: Compare different rates and potentially make a parameter?
    sampling_rate = 102
    for i in range(
        1, sampling_rate
    ):  # exclude the edges to avoid asymptote-related errors
        x = x_min + ((x_max - x_min) / sampling_rate) * i
        try:
            x_screen = graph_to_screen_x(x_start, x_end, width, x)
            y = f(x)
            if type(y) is complex:
                raise ArithmeticError
            y_screen = graph_to_screen_y(y_start, y_end, height, y)
            if x_screen is not None and y_screen is not None:
                spline.append([x_screen, y_screen])
        except Exception:
            return spline, True, x + 0.001
    return spline, False, None


def point_on_function(grader, point, func, tolerance):  # pixel tolerance
    """Returns whether the point is on the function specified within tolerance
    Args:
        point: a list of two values representing the point's coordinates in an [x,y] format (ex. [1,1])
        func: a callable function (ex. lambda x : x^2)

    Returns:
        boolean value representing whether the point is on the function
    """
    # set up debugger vars
    if grader.debug:
        grader.debugger.clear_vars()
        grader.debugger.var2 = float("inf")

    np.seterr(invalid="ignore")
    test_range = [
        point[0] - tolerance / grader.xscale,
        point[0] + tolerance / grader.xscale,
    ]
    one_unit = 1 / grader.xscale  # check each pixel in test_range

    for i in range(tolerance * 2 + 1):
        x = test_range[0] + i * one_unit
        try:
            fun_y = func(x)
            if not grader.within_y_range(fun_y, negative_tolerance=10):
                continue
            d = abs(point[1] - fun_y) * grader.yscale
            if d <= tolerance:
                np.seterr(invalid="warn")
                return True
            if grader.debug:
                grader.debugger.var1 = (
                    [x, fun_y] if d < grader.debugger.var2 else grader.debugger.var1
                )
                grader.debugger.var2 = min(grader.debugger.var2, d)
        except Exception as e:
            if grader.debug:
                grader.debugger.add(
                    f"Error calculating function at x = {point[0]}: {e}"
                )
            continue
    np.seterr(invalid="warn")
    if grader.debug:
        grader.debugger.add(f"Submitted Point: {point}")
        grader.debugger.add(f"Closest Actual Point: {grader.debugger.var1}")
        grader.debugger.add(f"y-Distance: {grader.debugger.var2} px")
    return False


def point_on_function_x_compare(grader, point, splines, tolerance):
    # set up debugger vars
    if grader.debug:
        grader.debugger.clear_vars()
        grader.debugger.var2 = float("inf")

    test_range = [
        point[1] - tolerance / grader.yscale,
        point[1] + tolerance / grader.yscale,
    ]
    one_unit = 1 / grader.yscale  # check (x,y) at each pixel in test_range
    function_within_range = False
    for s in splines:
        for c in s.functions:  # CurveFunctions
            for i in range(tolerance * 2 + 1):
                y = test_range[0] + i * one_unit
                try:
                    if c.exists_at_y(y):
                        function_within_range = True
                        x = c.get_horizontal_line_crossings(y)
                        x = [val for val in x if grader.within_x_range(val)]
                        for val in x:
                            d = abs(val - point[0]) * grader.xscale
                            if d <= tolerance:
                                return True
                            if grader.debug:
                                grader.debugger.var1 = (
                                    [x, y]
                                    if d < grader.debugger.var2
                                    else grader.debugger.var1
                                )
                                grader.debugger.var2 = min(grader.debugger.var2, d)
                except Exception:
                    continue
    # no values on the function at the corresponding y value (can happen for functions that have asymptote at y axis)
    if not function_within_range:
        min_distance = float("inf")
        closest_ep_x = []
        for s in splines:
            ep = s.get_closest_endpoint(yval=point[1])
            if abs(ep[1] - point[1]) < min_distance:
                if grader.debug:
                    grader.debugger.var3 = ep[1]
                min_distance = abs(ep[1] - point[1])
                closest_ep_x = ep[0]
        if abs(closest_ep_x - point[0]) * grader.xscale <= tolerance:
            return True
        if grader.debug:
            grader.debugger.var1 = [closest_ep_x, grader.debugger.var3]
            grader.debugger.var2 = abs(closest_ep_x - point[0]) * grader.xscale
    if grader.debug:
        grader.debugger.add(f"Submitted Point: {point}")
        grader.debugger.add(f"Closest Actual Point: {grader.debugger.var1}")
        grader.debugger.add(f"x-Distance: {grader.debugger.var2} px")
    return False


def point_ltgt_function(grader, point, func, greater, tolerance):  # pixel tolerance
    # set up debug
    if grader.debug:
        grader.debugger.clear_vars()
        grader.debugger.var1 = float("inf")  # store lowest distance
    test_range = [
        point[0] - tolerance / grader.xscale,
        point[0] + tolerance / grader.xscale,
    ]
    one_unit = 1 / grader.xscale  # check each pixel in test_range
    g_tol = tolerance / grader.yscale
    for i in range(tolerance * 2 + 1):
        x = test_range[0] + i * one_unit
        try:
            fun_y = func(x)
            if greater:
                if point[1] >= fun_y - g_tol:
                    return True
            elif point[1] <= fun_y + g_tol:
                return True
            if grader.debug:
                grader.debugger.var1 = min(
                    grader.debugger.var1, abs(point[1] - fun_y) * grader.yscale
                )
        except Exception:
            continue
    if grader.debug:
        if greater:
            grader.debugger.add(
                f"Point [{point[0]},{point[1]}] is {grader.debugger.var1} pixels below the function."
            )
            grader.debugger.add(f"Max allowed is {tolerance}.")
        else:
            grader.debugger.add(
                f"Point [{point[0]},{point[1]}] is {grader.debugger.var1} pixels above the function."
            )
            grader.debugger.add(f"Max allowed is {tolerance}.")
    return False


# Helper function for matches_function_domain. Returns how much one
# part of the submission domain(x1, x2) overlaps with all the domains
# of the specified function (rd)
def get_coverage_px(grader, rd, x1, x2):
    coverage = 0
    for i in range(len(rd)):
        r = rd[i]
        if x1 < r[0] and x2 > r[1]:
            coverage += r[1] - r[0]
            continue
        if x1 > r[0] and x1 < r[1] and x2 > r[0] and x2 < r[1]:
            coverage += x2 - x1
            continue
        if x1 > r[0] and x1 < r[1]:
            coverage += r[1] - x1
            continue
        if x2 > r[0] and x2 < r[1]:
            coverage += x2 - r[0]
            continue
    cov_total_px = coverage * grader.xscale
    return cov_total_px


def graph_to_screen_x(x_start, x_end, width, x):
    xrange = abs(x_end - x_start)
    conv_scale = width / xrange
    if x < x_start:
        x_graph_dist = x_start - x
        x_screen_dist = x_graph_dist * conv_scale
        return x_screen_dist
    x_graph_dist = abs(x_start - x)
    x_screen_dist = x_graph_dist * conv_scale
    return x_screen_dist


def graph_to_screen_y(y_start, y_end, height, y):
    yrange = abs(y_end - y_start)
    conv_scale = height / yrange
    if y > y_end:
        y_graph_dist = y_end - y
        y_screen_dist = y_graph_dist * conv_scale
        return y_screen_dist
    y_graph_dist = abs(y_end - y)
    y_screen_dist = y_graph_dist * conv_scale
    return y_screen_dist


def screen_to_graph_x(x_start, x_end, width, x):
    xrange = abs(x_end - x_start)
    conv_scale = xrange / width
    x_screen_dist = x
    x_graph_location = x_start + x_screen_dist * conv_scale
    return x_graph_location


def screen_to_graph_y(y_start, y_end, height, y):
    yrange = abs(y_end - y_start)
    conv_scale = yrange / height
    y_screen_dist = y
    y_graph_location = y_end - y_screen_dist * conv_scale
    return y_graph_location


def screen_to_graph(value, info, x=True):
    config_data = info["submission"]["meta"]["config"]
    graph_range = (
        abs(config_data["xrange"][1] - config_data["xrange"][0])
        if x
        else abs(config_data["yrange"][1] - config_data["yrange"][0])
    )
    converted_value = screen_to_graph_dist(
        graph_range=graph_range,
        screen_range=config_data["width"] if x else config_data["height"],
        screen_dist=value,
    )
    return converted_value


def graph_to_screen(value, info, x=True):
    config_data = info["submission"]["meta"]["config"]
    graph_range = (
        abs(config_data["xrange"][1] - config_data["xrange"][0])
        if x
        else abs(config_data["yrange"][1] - config_data["yrange"][0])
    )
    converted_value = graph_to_screen_dist(
        graph_range=graph_range,
        screen_range=config_data["width"] if x else config_data["height"],
        graph_dist=value,
    )
    return converted_value


def screen_to_graph_dist(graph_range, screen_range, screen_dist):
    conversion_scale = graph_range / screen_range
    return screen_dist * conversion_scale


def graph_to_screen_dist(graph_range, screen_range, graph_dist):
    conversion_scale = screen_range / graph_range
    return graph_dist * conversion_scale
