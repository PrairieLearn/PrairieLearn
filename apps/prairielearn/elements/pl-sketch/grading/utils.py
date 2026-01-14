import ast
import copy
import math
from collections.abc import Callable

from .model import (
    Asymptote,
    GradeableFunction,
    LineSegment,
    Polygon,
)
from .model.fit_curve import fitCurve
from .model.GradeableFunction import function_to_spline
from .types import SketchCanvasSize, SketchGrader, SketchInitial, SketchTool


def parse_function_string(s: str) -> Callable[[float], float]:
    # If xyflip is set to true, functions might be defined using y as variable name
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


def graph_to_screen(start: float, end: float, canvas_size: int, value: float) -> float:
    return (value - start) * canvas_size / (end - start)


def graph_to_screen_submission(
    submission: dict, use_xaxis: bool, distance: bool, value: float
) -> float:
    start = (
        0
        if distance
        else (
            submission["meta"]["config"]["xrange"][0]
            if use_xaxis
            else submission["meta"]["config"]["yrange"][1]
        )
    )
    end = (
        submission["meta"]["config"]["xrange"][1]
        if use_xaxis
        else submission["meta"]["config"]["yrange"][0]
    )
    canvas_size = (
        submission["meta"]["config"]["width"]
        if use_xaxis
        else submission["meta"]["config"]["height"]
    )

    return graph_to_screen(start, end, canvas_size, value)


def screen_to_graph(start: float, end: float, canvas_size: int, value: float) -> float:
    return start + value * (end - start) / canvas_size


def screen_to_graph_submission(
    submission: dict, use_xaxis: bool, distance: bool, value: float
) -> float:
    start = (
        0
        if distance
        else (
            submission["meta"]["config"]["xrange"][0]
            if use_xaxis
            else submission["meta"]["config"]["yrange"][1]
        )
    )
    end = (
        submission["meta"]["config"]["xrange"][1]
        if use_xaxis
        else submission["meta"]["config"]["yrange"][0]
    )
    canvas_size = (
        submission["meta"]["config"]["width"]
        if use_xaxis
        else submission["meta"]["config"]["height"]
    )

    return screen_to_graph(start, end, canvas_size, value)


def get_gap_length_px(
    rd: list[list[float]], x1: float, x2: float, submission: dict
) -> float:
    if rd == []:
        return graph_to_screen_submission(submission, True, False, (x2 - x1))
    gap_total = 0
    rstart = [float("-inf"), submission["meta"]["config"]["xrange"][0]]
    rend = [submission["meta"]["config"]["xrange"][1], float("inf")]
    rd.insert(0, rstart)
    rd.append(rend)
    for i in range(len(rd) - 1):
        r = rd[i]
        r_next = rd[i + 1]
        # TODO: Both x1 and x2 between
        if x1 >= r[1] and x1 < r_next[0]:
            gap_total += r_next[0] - x1
        if x2 > r[1] and x2 <= r_next[0]:
            gap_total += x2 - r[1]
        if r[1] > x1 and r_next[0] < x2:
            gap_total += r_next[0] - r[1]

    gap_total_px = graph_to_screen_submission(submission, True, True, gap_total)
    return gap_total_px


def get_coverage_length_px(
    grader: SketchGrader,
    submission: dict,
    tools_to_check: list[str],
    tool_dict: dict[str, SketchTool],
    x1: float,
    x2: float,
) -> float:

    if len(tools_to_check) == 0:
        return True

    gf_tools = ["spline", "freeform", "polyline", "point"]
    xrange = []
    tool_grader = None
    for toolid in tools_to_check:
        tool_used = tool_dict[toolid]["name"]
        if tool_used == "polygon":
            tool_grader = Polygon.Polygons(grader, submission, toolid)
        elif tool_used in gf_tools:
            tool_grader = GradeableFunction.GradeableFunction(
                grader, submission, toolid
            )
        elif tool_used == "horizontal-line":
            tool_grader = Asymptote.HorizontalAsymptotes(grader, submission, toolid)
        elif tool_used == "vertical-line":
            tool_grader = Asymptote.VerticalAsymptotes(grader, submission, toolid)
        else:  # line-segment
            tool_grader = LineSegment.LineSegments(grader, submission, toolid)
        # add tool's range to all ranges
        if tool_grader:
            xrange += tool_grader.get_range_defined()

    if not tool_grader:
        return 0

    rd = tool_grader.collapse_ranges(xrange)

    gap_length = get_gap_length_px(rd, x1, x2, submission)

    width_px = graph_to_screen_submission(submission, True, True, (x2 - x1))
    return width_px - gap_length


def get_tools_to_check(
    grader: SketchGrader,
    submission: dict,
    not_allowed: list[str] | None = None,
) -> list[str]:
    if not_allowed is None:
        not_allowed = []
    tools_to_check = [
        tool["id"]
        for tool in grader["toolid"]
        if len(submission["gradeable"][tool["id"]]) != 0
        and not tool["helper"]
        and tool["name"] not in not_allowed
        and not (
            "polygon" in not_allowed and tool["name"] == "polyline" and tool["closed"]
        )
    ]
    return tools_to_check


def get_num_in_bound_occurrences(
    toolid: str,
    tool_dict: dict[str, SketchTool],
    submission: dict,
    x1: float,
    x2: float,
) -> int:
    tool_used = tool_dict[toolid]["name"]
    occs = []
    gradeable = submission["gradeable"]
    data = gradeable[toolid]
    if tool_used == "point":
        for point in data:
            if point["point"] not in occs and point_in_range(
                point["point"], x1, x2, submission, pix=True
            ):
                occs.append(point["point"])
    else:
        for spline in data:
            if spline["spline"] not in occs and spline_in_range(
                spline["spline"],
                x1,
                x2,
                submission,
                pix=True,
                vl=(tool_used == "vertical-line"),
                hl=(tool_used == "horizontal-line"),
            ):
                occs.append(spline["spline"])
    return len(occs)


def spline_in_range(
    spline: list[tuple[float, float]],
    x1: float,
    x2: float,
    submission: dict,
    pix: bool = False,
    hl: bool = False,
    vl: bool = False,
) -> bool:
    real_points = [spline[i] for i in range(len(spline)) if i % 3 == 0]
    for point in real_points:
        if point_in_range(point, x1, x2, submission, pix=pix, hl=hl, vl=vl):
            return True
    return False


def point_in_range(
    point: tuple[float, float],
    x1: float,
    x2: float,
    submission: dict,
    pix: bool = False,
    hl: bool = False,
    vl: bool = False,
) -> bool:
    xrange = submission["meta"]["config"]["xrange"]
    yrange = submission["meta"]["config"]["yrange"]
    width = submission["meta"]["config"]["width"]
    height = submission["meta"]["config"]["height"]

    if pix:  # convert to graph coordinates
        x = screen_to_graph(xrange[0], xrange[1], width, point[0])
        y = screen_to_graph(yrange[1], yrange[0], height, point[1])
        point = (x, y)
    if hl:
        return in_range(point[1], yrange[0], yrange[1])
    elif vl:
        return in_range(point[0], x1, x2)
    return in_range(point[1], yrange[0], yrange[1]) and in_range(point[0], x1, x2)


def flip_grader_data(submission: dict) -> dict:
    range_data: SketchCanvasSize = {
        "x_start": submission["meta"]["config"]["xrange"][0],
        "x_end": submission["meta"]["config"]["xrange"][1],
        "y_start": submission["meta"]["config"]["yrange"][0],
        "y_end": submission["meta"]["config"]["yrange"][1],
        "width": submission["meta"]["config"]["width"],
        "height": submission["meta"]["config"]["height"],
    }
    submission_new = copy.deepcopy(submission)
    submission_data = submission_new["gradeable"]
    for toolid in submission_data:
        for i in range(len(submission_data[toolid])):
            if "spline" in submission_data[toolid][i]:
                new_points = [
                    flip_point(point, range_data)
                    for point in submission_data[toolid][i]["spline"]
                ]
                submission_data[toolid][i]["spline"] = new_points
            if "point" in submission_data[toolid][i]:
                submission_data[toolid][i]["point"] = flip_point(
                    submission_data[toolid][i]["point"], range_data
                )
    submission_new["meta"]["config"]["xrange"] = [
        range_data["y_start"],
        range_data["y_end"],
    ]
    submission_new["meta"]["config"]["yrange"] = [
        range_data["x_start"],
        range_data["x_end"],
    ]
    submission_new["meta"]["config"]["width"] = range_data["height"]
    submission_new["meta"]["config"]["height"] = range_data["width"]

    return submission_new


def flip_point(
    point: tuple[float, float], range_data: SketchCanvasSize
) -> tuple[float, float]:  # point = [x,y]
    x, y = point
    # convert the point back to a graph coordinate
    x_g = screen_to_graph(
        range_data["x_start"],
        range_data["x_end"],
        range_data["width"],
        x,
    )
    y_g = screen_to_graph(
        range_data["y_end"],
        range_data["y_start"],
        range_data["height"],
        y,
    )
    # convert the swapped point to a screen coordinate with the swapped screen dimensions
    x_s = graph_to_screen(
        range_data["y_start"],
        range_data["y_end"],
        range_data["height"],
        y_g,
    )
    y_s = graph_to_screen(
        range_data["x_end"],
        range_data["x_start"],
        range_data["width"],
        x_g,
    )
    return (x_s, y_s)


def in_range(val: float, start: float, end: float, tolerance: float = 0) -> bool:
    return bool(val >= start + tolerance and val <= end - tolerance)


def format_initials(
    initials: list[SketchInitial], tool: SketchTool, ranges: SketchCanvasSize
) -> list:
    """
    Convert initial drawing data for one sketching tool into the data format that is used by the client.
    Note that this function does not validate the inputs and assumes that attribute combinations are all
    appropriate for the given tool type.

    Returns:
        A list that can be converted into JSON for the client
    """
    new_format = []
    if tool["name"] in ["horizontal-line", "vertical-line"]:
        coordinates = []
        for initial in initials:
            if initial["toolid"] == tool["id"]:
                coordinates += initial["coordinates"]

        if tool["name"] == "vertical-line":
            new_format = [
                {
                    "x": graph_to_screen(
                        ranges["x_start"],
                        ranges["x_end"],
                        ranges["width"],
                        coord,
                    )
                }
                for coord in coordinates
            ]
        else:
            new_format = [
                {
                    "y": graph_to_screen(
                        ranges["y_end"],
                        ranges["y_start"],
                        ranges["height"],
                        coord,
                    )
                }
                for coord in coordinates
            ]
    elif tool["name"] in ["spline", "freeform", "polyline"]:
        for initial in initials:
            if initial["toolid"] == tool["id"]:
                if initial["fun"] is None:
                    coordinates = initial["coordinates"]
                    x_y_vals = [
                        [
                            graph_to_screen(
                                ranges["x_start"],
                                ranges["x_end"],
                                ranges["width"],
                                coordinates[i],
                            ),
                            graph_to_screen(
                                ranges["y_end"],
                                ranges["y_start"],
                                ranges["height"],
                                coordinates[i + 1],
                            ),
                        ]
                        for i in range(0, len(coordinates), 2)
                    ]
                    # Free-draw needs special handling since it is stored in a different data format on the client side
                    if tool["name"] == "freeform":
                        x_y_vals = fitCurve(x_y_vals, 5)
                    formatted_x_y_vals = [
                        {"x": val[0], "y": val[1]} for val in x_y_vals
                    ]
                    new_format.append(formatted_x_y_vals)
                else:
                    function = None
                    x1, x2 = initial["xrange"]
                    function = parse_function_string(initial["fun"])
                    # Automatically try to handle discontinuities by splitting up functions if sampling leads to undefined values
                    broken = True
                    while broken:
                        x_y_vals, broken, new_start = function_to_spline(
                            function,
                            x1,
                            x2,
                            ranges,
                        )
                        if len(x_y_vals) > 0:
                            # Free-draw needs special handling since it is stored in a different data format on the client side
                            if tool["name"] == "freeform":
                                x_y_vals = fitCurve(x_y_vals, 5)
                            formatted_x_y_vals = [
                                {"x": val[0], "y": val[1]} for val in x_y_vals
                            ]
                            new_format.append(formatted_x_y_vals)
                        if broken:
                            x1 = new_start
    else:  # one and two point tools
        new_format = []
        for initial in initials:
            if initial["toolid"] == tool["id"]:
                coordinates = initial["coordinates"]
                new_format += [
                    {
                        "x": graph_to_screen(
                            ranges["x_start"],
                            ranges["x_end"],
                            ranges["width"],
                            coordinates[i],
                        ),
                        "y": graph_to_screen(
                            ranges["y_end"],
                            ranges["y_start"],
                            ranges["height"],
                            coordinates[i + 1],
                        ),
                    }
                    for i in range(0, len(coordinates), 2)
                ]
    return new_format
