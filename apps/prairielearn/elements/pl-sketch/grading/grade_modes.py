import base64
import copy
import json

from .model import Asymptote, GradeableFunction, LineSegment, Polygon
from .utils import (
    collapse_ranges,
    graph_to_screen,
    graph_to_screen_x,
    graph_to_screen_y,
    parse_function_string,
    screen_to_graph,
    screen_to_graph_x,
    screen_to_graph_y,
)


def grade_submission(grader, data, name):
    submission = data["submitted_answers"].get(
        name + "-sketchresponse-submission", None
    )
    submitted_answer = json.loads(base64.b64decode(submission).decode("utf-8"))
    info = {"grader": grader, "submission": submitted_answer}
    tool_dict = data["params"][name]["sketch_config"]["tool_info"]
    match grader["type"]:
        case "match":
            return match(info, tool_dict)
        case "count":
            return count_grader(info, tool_dict)
        case "match-fun":
            return match_fun(info, tool_dict)
        case "monot-increasing":
            return monot_increasing(info, tool_dict)
        case "monot-decreasing":
            return monot_decreasing(info, tool_dict)
        case "concave-up":
            return concave_up(info, tool_dict)
        case "concave-down":
            return concave_down(info, tool_dict)
        case "defined-in":
            return defined_in(info, tool_dict)
        case "undefined-in":
            return undefined_in(info, tool_dict)
        case "greater-than":
            return greater_than(info, tool_dict)
        case "less-than":
            return less_than(info, tool_dict)
        case "match-angle":
            return match_angle(info, tool_dict)
        case _:
            return match_length(info, tool_dict)


def match(info, tool_dict):
    x, y = info["grader"]["x"], info["grader"]["y"]
    feedback_value = ("x = " + str(x)) if x is not None else ("y = " + str(y))
    tolerance, weight, incorrect_fb = get_t_w_fb(
        info, ("Missing expected element at " + feedback_value + ".")
    )
    tools_to_check = get_tools_to_check(info, tool_dict)

    gf_tools = [
        "point",
        "spline",
        "freeform",
        "polyline",
    ]  # grading function tools (-polyline, which is considered separately)

    debug = info["grader"]["debug"]
    debug_message = []

    correct = False
    tool_grader = None
    if debug and len(tools_to_check) == 0:
        debug_message.append("No submission found.")
    for toolid in tools_to_check:
        info["grader"]["currentTool"] = toolid
        tool_used = tool_dict[toolid]["type"]
        if tool_used == "polygon":
            tool_grader = Polygon.Polygons(info)
            correct = tool_grader.contains_point(
                x=x, y=y, tolerance=tolerance
            )  # no tolerance for (x,y) point currently
        elif tool_used in gf_tools:
            tool_grader = GradeableFunction.GradeableFunction(info)
            if tool_used == "point":
                pt_tolerance = info["grader"]["pt_tolerance"]
                correct = tool_grader.has_point_at(x=x, y=y, distTolerance=pt_tolerance)
            else:
                correct = tool_grader.has_value_at(
                    x=x, y=y, tolerance=tolerance
                )  # Note: also has x tolerance
        elif tool_used == "vertical-line":
            tool_grader = Asymptote.VerticalAsymptotes(info)
            correct = tool_grader.has_asym_at_value(x, tolerance=tolerance)
        elif tool_used == "horizontal-line":
            tool_grader = Asymptote.HorizontalAsymptotes(info)
            correct = tool_grader.has_asym_at_value(y, tolerance=tolerance)
        elif tool_used == "line-segment":
            tool_grader = LineSegment.LineSegments(info)
            if info["grader"]["endpoint"]:
                correct = tool_grader.check_eps(
                    point=[x, y], mode=info["grader"]["endpoint"], tolerance=tolerance
                )
            else:
                correct = tool_grader.has_value_at(
                    x=x, y=y, tolerance=tolerance
                )  # Note: also has x tolerance
        if debug and tool_grader:
            debug_message += tool_grader.debugger.get_message_as_list_and_clear()
        # if the answer is still correct after calling the tool grader functions, and it's okay for any tool to have this point, break
        if correct:
            break

    score = 1 if correct else 0
    feedback = [""] if correct else [incorrect_fb, *debug_message]

    return score, weight, feedback


def match_fun(info_in, tool_dict):
    tolerance, weight, incorrect_fb = get_t_w_fb(info_in, "Does not match function.")
    tools_to_check = get_tools_to_check(
        info_in, tool_dict, not_allowed=["vertical-line", "polygon"]
    )
    if info_in["grader"]["funxyswap"]:
        info = invert_grader_data(info_in)
    else:
        info = info_in
    x1, x2 = get_xrange(info)
    func = parse_function_string(info["grader"]["fun"])

    debug = info_in["grader"]["debug"]
    debug_message = []

    correct = True
    if len(tools_to_check) == 0:
        if debug:
            debug_message.append("No submission found.")
        correct = False
    for toolid in tools_to_check:
        info["grader"]["currentTool"] = toolid
        tool_used = tool_dict[toolid]["type"]
        tol = tolerance if tool_used != "point" else info["grader"]["pt_tolerance"]
        tool_grader = GradeableFunction.GradeableFunction(info)
        correct = tool_grader.matches_function(func, x1, x2, tol)
        if not correct:
            if debug:
                debug_message += tool_grader.debugger.get_message_as_list_and_clear()
            break
        if not info["grader"]["allowundefined"] and tool_used != "point":
            correct = tool_grader.covers_function_domain(func, x1, x2, 0.9)
            if not correct:
                if info["grader"]["feedback"] is None:
                    incorrect_fb += "Your function does not cover the entire domain of the specified curve."
                if debug:
                    debug_message += (
                        tool_grader.debugger.get_message_as_list_and_clear()
                    )
                break

    score = 1 if correct else 0
    feedback = [""] if correct else [incorrect_fb, *debug_message]
    return score, weight, feedback


def count_grader(info, tool_dict):
    tolerance, weight, incorrect_fb = get_t_w_fb(
        info, "Incorrect number of elements used."
    )
    tools_to_check = get_tools_to_check(info, tool_dict)

    g_tol = screen_to_graph(tolerance, info, x=True)
    x1, x2 = get_xrange(info)

    count = info["grader"]["count"]
    mode = info["grader"]["mode"]

    debug = info["grader"]["debug"]
    debug_message = []

    correct = True
    if len(tools_to_check) == 0 and (
        mode != "at-most" and count != 0
    ):  # if nothing drawn
        correct = False
        if debug:
            debug_message.append("No submission found.")
    for toolid in tools_to_check:
        if mode == "exact":
            # since count is so specific, we want to try with both kinds of tolerances, and without any tolerance.
            num_a = get_num_in_bound_occurrences(
                toolid,
                tool_dict,
                info,
                min(x1 - g_tol, x2 + g_tol),
                max(x1 - g_tol, x2 + g_tol),
            )
            num_b = get_num_in_bound_occurrences(
                toolid,
                tool_dict,
                info,
                min(x1 + g_tol, x2 - g_tol),
                max(x1 + g_tol, x2 - g_tol),
            )
            num_c = get_num_in_bound_occurrences(toolid, tool_dict, info, x1, x2)
            if count not in (num_a, num_b, num_c):
                correct = False
                if debug:
                    debug_message.extend((
                        f"Found counts: {num_a}, {num_b}, {num_c} with xrange expanded by {tolerance} pixels, shrunk by {tolerance} pixels, and kept the same, respectively.",
                        f"Required exactly {count}.",
                    ))
                break
        elif mode == "at-least":
            num = get_num_in_bound_occurrences(
                toolid,
                tool_dict,
                info,
                min(x1 - g_tol, x2 + g_tol),
                max(x1 - g_tol, x2 + g_tol),
            )
            if num < count:
                correct = False
                if debug:
                    debug_message.extend((
                        f"Found count: {num} with xrange expanded by {tolerance} pixels.",
                        f"Required at least {count}.",
                    ))
                break
        else:
            num = get_num_in_bound_occurrences(
                toolid,
                tool_dict,
                info,
                min(x1 + g_tol, x2 - g_tol),
                max(x1 + g_tol, x2 - g_tol),
            )
            if num > count:
                correct = False
                if debug:
                    debug_message.extend((
                        f"Found count: {num} with xrange shrunk by {tolerance} pixels.",
                        f"Required at most {count}.",
                    ))
                break

    score = 1 if correct else 0
    feedback = [""] if correct else [incorrect_fb, *debug_message]

    return score, weight, feedback


def monot_increasing(info, tool_dict):
    return check_monot_change(info, tool_dict, increasing=True)


def monot_decreasing(info, tool_dict):
    return check_monot_change(info, tool_dict, increasing=False)


# Function used for both monot increasing and decreasing
def check_monot_change(info, tool_dict, increasing):
    i_d = "increasing" if increasing else "decreasing"
    tolerance, weight, incorrect_fb = get_t_w_fb(
        info, "Function is not monotonically " + i_d + " in the correct domain(s). "
    )
    tools_to_check = get_tools_to_check(
        info,
        tool_dict,
        not_allowed=["point", "polygon", "vertical-line", "horizontal-line"],
    )
    gf_tools = ["spline", "freeform", "polyline"]

    x1, x2 = get_xrange(info)

    debug = info["grader"]["debug"]
    debug_message = []

    correct = True
    num_tools_in_range = 0
    if debug and len(tools_to_check) == 0:
        debug_message.append("No submission found.")
    for toolid in tools_to_check:
        if correct:
            info["grader"]["currentTool"] = toolid
            tool_used = tool_dict[toolid]["type"]
            if tool_used == "line-segment":
                tool_grader = LineSegment.LineSegments(info)
                if increasing:
                    correct = tool_grader.is_increasing_between(x1, x2)
                else:
                    correct = tool_grader.is_decreasing_between(x1, x2)
                if not correct:
                    if debug:
                        debug_message += (
                            tool_grader.debugger.get_message_as_list_and_clear()
                        )
                    break
                if correct != "ndef":
                    num_tools_in_range += 1
                else:
                    if debug:
                        debug_message += (
                            tool_grader.debugger.get_message_as_list_and_clear()
                        )
                    correct = True
            elif tool_used in gf_tools:
                tool_grader = GradeableFunction.GradeableFunction(info)
                if increasing:
                    correct = tool_grader.is_increasing_between(
                        xmin=x1, xmax=x2, numPoints=100, failureTolerance=tolerance
                    )
                else:
                    correct = tool_grader.is_decreasing_between(
                        xmin=x1, xmax=x2, numPoints=100, failureTolerance=tolerance
                    )
                if not correct:
                    if debug:
                        debug_message += (
                            tool_grader.debugger.get_message_as_list_and_clear()
                        )
                    break
                if correct != "ndef":
                    num_tools_in_range += 1
                else:
                    if debug:
                        debug_message += (
                            tool_grader.debugger.get_message_as_list_and_clear()
                        )
                    correct = True

    score = 1 if (correct and num_tools_in_range > 0) else 0
    feedback = (
        [""] if (correct and num_tools_in_range > 0) else [incorrect_fb, *debug_message]
    )
    return score, weight, feedback


def concave_up(info, tool_dict):
    return check_concavity(info, tool_dict, up=True)


def concave_down(info, tool_dict):
    return check_concavity(info, tool_dict, up=False)


# Function used for both upward and downward concavity
def check_concavity(info, tool_dict, up):
    tolerance, weight, incorrect_fb = get_t_w_fb(
        info, "Function has an incorrect shape."
    )
    tools_to_check = get_tools_to_check(
        info,
        tool_dict,
        not_allowed=["polygon", "point", "vertical-line", "horizontal-line"],
    )

    gf_tools = ["spline", "freeform", "polyline"]
    tool_grader = None

    x1, x2 = get_xrange(info)

    debug = info["grader"]["debug"]
    debug_message = []

    correct = True
    num_tools_in_range = 0
    if debug and len(tools_to_check) == 0:
        debug_message.append("No submission found.")
    for toolid in tools_to_check:
        info["grader"]["currentTool"] = toolid
        if correct:
            tool_used = tool_dict[toolid]["type"]
            if tool_used == "line-segment":
                tool_grader = LineSegment.LineSegments(info)  # TODO: tolerance??
                segments = tool_grader.get_segments_between_strict(xmin=x1, xmax=x2)
                if len(segments) > 0:
                    if debug:
                        debug_message.append("Found a line segment.")
                    correct = False
                    break
            elif tool_used in gf_tools:
                tool_grader = GradeableFunction.GradeableFunction(info)
                if tool_used == "polyline":
                    in_range = tool_grader.does_exist_between(x1, x2)
                    if in_range:
                        if debug:
                            debug_message.append("Found a polyline.")
                        correct = False
                        break
                else:
                    if up:
                        correct = tool_grader.has_positive_curvature_between(
                            xmin=x1,
                            xmax=x2,
                            numSegments=100,
                            failureTolerance=tolerance,
                        )
                    else:
                        correct = tool_grader.has_negative_curvature_between(
                            xmin=x1,
                            xmax=x2,
                            numSegments=100,
                            failureTolerance=tolerance,
                        )
                    if not correct:
                        if debug:
                            debug_message += (
                                tool_grader.debugger.get_message_as_list_and_clear()
                            )
                        break
                    if correct != "ndef":
                        num_tools_in_range += 1
                    elif debug:
                        debug_message += (
                            tool_grader.debugger.get_message_as_list_and_clear()
                        )
                    correct = True

    score = 1 if (correct and num_tools_in_range > 0) else 0
    feedback = (
        [""] if (correct and num_tools_in_range > 0) else [incorrect_fb, *debug_message]
    )

    return score, weight, feedback


def defined_in(info, tool_dict):
    tolerance, weight, incorrect_fb = get_t_w_fb(
        info, "Function is not defined over expected range(s)."
    )
    tools_to_check = get_tools_to_check(
        info, tool_dict, not_allowed=["vertical-line", "point"]
    )

    x1, x2 = get_xrange(info)

    if len(tools_to_check) == 0:
        score = 0
        feedback = incorrect_fb
        return score, weight, feedback

    debug = info["grader"]["debug"]
    debug_message = []
    tool_grader = None

    gf_tools = ["spline", "freeform", "polyline"]
    xrange = []
    if len(tools_to_check) == 0:
        debug_message.append("No submission found.")
    for toolid in tools_to_check:
        info["grader"]["currentTool"] = toolid
        tool_used = tool_dict[toolid]["type"]
        if tool_used == "polygon":
            tool_grader = Polygon.Polygons(info)
        elif tool_used in gf_tools:
            tool_grader = GradeableFunction.GradeableFunction(info)
        elif tool_used == "horizontal-line":
            tool_grader = Asymptote.HorizontalAsymptotes(info)
        elif tool_used == "line-segment":
            tool_grader = LineSegment.LineSegments(info)
        # add tool's range to all ranges
        if tool_grader:
            xrange += tool_grader.get_range_defined()

    rd = collapse_ranges(xrange)
    gap_length = get_gap_length_px(rd, x1, x2, info)
    correct = gap_length <= tolerance
    if debug:
        debug_message.extend((
            f"Gap length is {gap_length} pixels.",
            f"Max allowed is {tolerance} pixels.",
        ))
    # #check if each 10 px interval is empty. All must be false for the range to be considered as covered.
    score = 1 if correct else 0
    feedback = [""] if correct else [incorrect_fb]
    if not correct and len(debug_message) > 0:
        feedback += debug_message
    return score, weight, feedback


def get_gap_length_px(rd, x1, x2, info):
    if rd == []:
        return graph_to_screen((x2 - x1), info, x=True)
    gap_total = 0
    rstart = [float("-inf"), info["submission"]["meta"]["config"]["xrange"][0]]
    rend = [info["submission"]["meta"]["config"]["xrange"][1], float("inf")]
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

    gap_total_px = graph_to_screen(gap_total, info, x=True)
    return gap_total_px


def undefined_in(info, tool_dict):
    tolerance, weight, incorrect_fb = get_t_w_fb(
        info, "Graph is not undefined over expected domain(s)."
    )
    tools_to_check = get_tools_to_check(info, tool_dict)

    x1 = None
    x2 = None

    debug = info["grader"]["debug"]
    debug_message = []

    x1, x2 = get_xrange(info)
    if x1 == x2:  # if we are checking only one point, grading is different.
        correct = False
        coord_tolerance = screen_to_graph(tolerance, info, True)
        twop_range = screen_to_graph(2, info, True)
        # info = copy.deepcopy(info) #Copy here so that changes aren't reflected in original?
        xval = x1
        min_x = xval - coord_tolerance
        for i in range(
            tolerance
        ):  # check every two-pixel interval in the range defined by the specified tolerance to see if there's a gap.
            x1 = min_x + (twop_range * i)
            x2 = min_x + (twop_range * (i + 1))
            coverage = get_coverage_length_px(
                info, tools_to_check, tool_dict, x1, x2
            )  # tolerance is 0 within the 2px interval
            correct = coverage < 0
            if correct:
                break
        if not correct:
            debug_message.append(
                f"No gap found within {tolerance} pixel margin of x = {xval} ([{min_x},{min_x + tolerance * twop_range}])."
            )
    else:
        coverage = get_coverage_length_px(info, tools_to_check, tool_dict, x1, x2)
        correct = coverage <= tolerance
        if not correct and debug:
            debug_message.extend((
                f"{coverage} pixels not empty in xrange.",
                f"Max allowed coverage is {tolerance} pixels.",
            ))
    score = 1 if correct else 0
    feedback = [""] if correct else [incorrect_fb] + debug_message
    return score, weight, feedback


def get_coverage_length_px(info, tools_to_check, tool_dict, x1, x2):

    if len(tools_to_check) == 0:
        return True

    gf_tools = ["spline", "freeform", "polyline", "point"]
    xrange = []
    tool_grader = None
    for toolid in tools_to_check:
        info["grader"]["currentTool"] = toolid
        tool_used = tool_dict[toolid]["type"]
        if tool_used == "polygon":
            tool_grader = Polygon.Polygons(info)
        elif tool_used in gf_tools:
            tool_grader = GradeableFunction.GradeableFunction(info)
        elif tool_used == "horizontal-line":
            tool_grader = Asymptote.HorizontalAsymptotes(info)
        elif tool_used == "vertical-line":
            tool_grader = Asymptote.VerticalAsymptotes(info)
        elif tool_used == "line-segment":
            tool_grader = LineSegment.LineSegments(info)
        # add tool's range to all ranges
        if tool_grader:
            xrange += tool_grader.get_range_defined()

    rd = collapse_ranges(xrange)

    gap_length = get_gap_length_px(rd, x1, x2, info)
    width_px = graph_to_screen((x2 - x1), info, x=True)
    return width_px - gap_length


def greater_than(info, tool_dict):
    return check_ltgt(info, tool_dict, greater=True)


def less_than(info, tool_dict):
    return check_ltgt(info, tool_dict, greater=False)


# used for both less than and greater than y
def check_ltgt(info_in, tool_dict, greater):
    g_l = "greater" if greater else "less"
    tolerance, weight, incorrect_fb = get_t_w_fb(
        info_in,
        "An element is not "
        + g_l
        + " than a specific function or y value in a certain range.",
    )
    tools_to_check = get_tools_to_check(
        info_in, tool_dict, not_allowed=["vertical-line"]
    )

    if info_in["grader"]["funxyswap"]:
        info = invert_grader_data(info_in)
    else:
        info = info_in

    gf_tools = ["point", "spline", "freeform", "polyline"]

    y = info["grader"]["y"]
    func = parse_function_string(info["grader"]["fun"])
    x1, x2 = get_xrange(info)

    graph_tolerance = screen_to_graph(tolerance, info, x=False)

    debug = info["grader"]["debug"]
    debug_message = []

    correct = True
    num_tools_in_range = 0
    if debug and len(tools_to_check) == 0:
        debug_message.append("No submission found.")
    for toolid in tools_to_check:
        info["grader"]["currentTool"] = toolid
        tool_used = tool_dict[toolid]["type"]
        if tool_used == "line-segment":
            tool_grader = LineSegment.LineSegments(info)
            if greater:
                correct = (
                    tool_grader.is_greater_than_y_between(y, x1, x2, tolerance)
                    if func is None
                    else tool_grader.gt_function(func, x1, x2, tolerance)
                )
            else:
                correct = (
                    tool_grader.is_less_than_y_between(y, x1, x2, tolerance)
                    if func is None
                    else tool_grader.lt_function(func, x1, x2, tolerance)
                )
            if not correct:
                if debug:
                    debug_message += (
                        tool_grader.debugger.get_message_as_list_and_clear()
                    )
                break
            if correct != "ndef":
                num_tools_in_range += 1
            elif debug:
                debug_message += tool_grader.debugger.get_message_as_list_and_clear()
            correct = True
        elif tool_used == "horizontal-line":
            tool_grader = Asymptote.HorizontalAsymptotes(info)
            if greater:
                correct = (
                    tool_grader.greater_than_y(y, tolerance=graph_tolerance)
                    if func is None
                    else tool_grader.gt_function(func, x1, x2, tolerance)
                )
            else:
                correct = (
                    tool_grader.less_than_y(y, tolerance=graph_tolerance)
                    if func is None
                    else tool_grader.lt_function(func, x1, x2, tolerance)
                )
            if not correct:
                if debug:
                    debug_message += (
                        tool_grader.debugger.get_message_as_list_and_clear()
                    )
                break
            if correct != "ndef":
                num_tools_in_range += 1
            elif debug:
                debug_message += tool_grader.debugger.get_message_as_list_and_clear()
            correct = True
        elif tool_used == "polygon":
            tool_grader = Polygon.Polygons(info)
            if greater:
                correct = (
                    tool_grader.is_greater_than_y_between(y, x1, x2, tolerance)
                    if func is None
                    else tool_grader.gt_function(func, x1, x2, tolerance)
                )
            else:
                correct = (
                    tool_grader.is_less_than_y_between(y, x1, x2, tolerance)
                    if func is None
                    else tool_grader.lt_function(func, x1, x2, tolerance)
                )
            if not correct:
                if debug:
                    debug_message += (
                        tool_grader.debugger.get_message_as_list_and_clear()
                    )
                break
            if correct != "ndef":
                num_tools_in_range += 1
            elif debug:
                debug_message += tool_grader.debugger.get_message_as_list_and_clear()
            correct = True
        elif tool_used in gf_tools:
            tool_grader = GradeableFunction.GradeableFunction(info)
            if tool_used == "point":
                if greater:
                    correct = (
                        tool_grader.points_greater_than_y(y, x1, x2, tolerance)
                        if func is None
                        else tool_grader.gt_function(func, x1, x2, tolerance)
                    )

                else:
                    correct = (
                        tool_grader.points_less_than_y(y, x1, x2, tolerance)
                        if func is None
                        else tool_grader.lt_function(func, x1, x2, tolerance)
                    )
                if not correct:
                    if debug:
                        debug_message += (
                            tool_grader.debugger.get_message_as_list_and_clear()
                        )
                    break
                if correct != "ndef":
                    num_tools_in_range += 1
                elif debug:
                    debug_message += (
                        tool_grader.debugger.get_message_as_list_and_clear()
                    )
                correct = True
            else:
                # functions = tool_grader.find_functions_between(xmin=x1, xmax=x2)
                # if len(functions) > 0:
                if greater:
                    correct = (
                        tool_grader.is_greater_than_y_between(
                            y=y, xmin=x1, xmax=x2, tolerance=tolerance
                        )
                        if func is None
                        else tool_grader.gt_function(func, x1, x2, tolerance)
                    )
                else:
                    correct = (
                        tool_grader.is_less_than_y_between(
                            y=y, xmin=x1, xmax=x2, tolerance=tolerance
                        )
                        if func is None
                        else tool_grader.lt_function(func, x1, x2, tolerance)
                    )
                if not correct:
                    if debug:
                        debug_message += (
                            tool_grader.debugger.get_message_as_list_and_clear()
                        )
                    break
                if correct != "ndef":
                    num_tools_in_range += 1
                elif debug:
                    debug_message += (
                        tool_grader.debugger.get_message_as_list_and_clear()
                    )
                correct = True

    score = 1 if (correct and num_tools_in_range > 0) else 0
    feedback = (
        [""] if (correct and num_tools_in_range > 0) else [incorrect_fb, *debug_message]
    )

    return score, weight, feedback


def match_length(info, tool_dict):

    tolerance, weight, incorrect_fb = get_t_w_fb(info, "Vector has incorrect length.")
    tools_to_check = get_tools_to_check(info, tool_dict)

    length = info["grader"]["length"]

    debug = info["grader"]["debug"]
    debug_message = []

    correct = True
    num_tools_in_range = 0
    if debug and len(tools_to_check) == 0:
        debug_message.append("No submission found.")
    for toolid in tools_to_check:
        info["grader"]["currentTool"] = toolid
        tool_grader = LineSegment.LineSegments(info)
        correct = tool_grader.match_length(length, tolerance)
        if not correct:
            if debug:
                debug_message += tool_grader.debugger.get_message_as_list_and_clear()
            break
        if correct != "ndef":
            num_tools_in_range += 1
        correct = True

    score = 1 if (correct and num_tools_in_range > 0) else 0
    feedback = (
        [""] if (correct and num_tools_in_range > 0) else [incorrect_fb, *debug_message]
    )

    return score, weight, feedback


def match_angle(info, tool_dict):
    tolerance, weight, incorrect_fb = get_t_w_fb(
        info, "Vector has incorrect angle with respect to the x-axis."
    )
    tools_to_check = get_tools_to_check(info, tool_dict)

    angle = info["grader"]["angle"]

    debug = info["grader"]["debug"]
    debug_message = []

    correct = True
    num_tools_in_range = 0
    if debug and len(tools_to_check) == 0:
        debug_message.append("No submission found.")
    for toolid in tools_to_check:
        info["grader"]["currentTool"] = toolid
        tool_grader = LineSegment.LineSegments(info)
        correct = tool_grader.match_angle(angle, info["grader"]["allowflip"], tolerance)
        if not correct:
            if debug:
                debug_message += tool_grader.debugger.get_message_as_list_and_clear()
            break
        if correct != "ndef":
            num_tools_in_range += 1
        correct = True

    score = 1 if (correct and num_tools_in_range > 0) else 0
    feedback = (
        [""] if (correct and num_tools_in_range > 0) else [incorrect_fb, *debug_message]
    )

    return score, weight, feedback


# HELPER FUNCTIONS #######


def get_xrange(info):
    graph_min = None
    graph_max = None

    buffer = 10  # pixels
    graph_buffer = screen_to_graph(buffer, info, True)  # grey area on graph

    config_data = info["submission"]["meta"]["config"]
    graph_min = config_data["xrange"][0] + graph_buffer
    graph_max = config_data["xrange"][1] - graph_buffer

    x1 = None
    x2 = None
    if info["grader"]["x1"] is not None:
        x1 = max(info["grader"]["x1"], graph_min)
    else:
        x1 = graph_min

    if info["grader"]["x2"] is not None:
        x2 = min(info["grader"]["x2"], graph_max)
    else:
        x2 = graph_max
    return x1, x2


def get_t_w_fb(info, feedback):
    tolerance = info["grader"]["tolerance"]
    weight = info["grader"]["weight"]
    incorrect_fb = (
        info["grader"]["feedback"]
        if info["grader"]["feedback"] is not None
        else feedback
    )
    return tolerance, weight, incorrect_fb


def get_tools_to_check(info, tool_dict, not_allowed=[]):
    if info["grader"]["toolid"] is not None:
        tools_to_check = [
            t.strip()
            for t in info["grader"]["toolid"].split(",")
            if len(info["submission"]["gradeable"][t.strip()]) != 0
        ]
    else:
        tools_to_check = [
            t
            for t in info["submission"]["gradeable"]
            if len(info["submission"]["gradeable"][t]) != 0
            and not tool_dict[t]["helper"]
            and tool_dict[t]["type"] not in not_allowed
        ]
    return tools_to_check


def get_num_in_bound_occurrences(toolid, tool_dict, info, x1, x2):
    tool_used = tool_dict[toolid]["type"]
    occs = []
    gradeable = info["submission"]["gradeable"]
    data = gradeable[toolid]
    if tool_used == "point":
        for point in data:
            if point["point"] not in occs and point_in_range(
                point["point"], x1, x2, info, pix=True
            ):
                occs.append(point["point"])
    elif tool_used == "horizontal-line":
        for spline in data:
            if spline["spline"] not in occs and spline_in_range(
                spline["spline"], x1, x2, info, pix=True, hl=True
            ):
                occs.append(spline["spline"])
    else:  # spline_tools = "spline", "freeform", "polyline", "vertical-line", "horizontal-line"
        for spline in data:
            if spline["spline"] not in occs and spline_in_range(
                spline["spline"], x1, x2, info, pix=True
            ):
                occs.append(spline["spline"])
    return len(occs)


def spline_in_range(spline, x1, x2, info, pix=False, hl=False):
    real_points = [spline[i] for i in range(len(spline)) if i % 3 == 0]
    for point in real_points:
        if point_in_range(point, x1, x2, info, pix=pix, hl=hl):
            return True
    return False


def point_in_range(point, x1, x2, info, pix=False, hl=False):
    if pix:  # convert to graph coordinates
        xrange = info["submission"]["meta"]["config"]["xrange"]
        yrange = info["submission"]["meta"]["config"]["yrange"]
        width = info["submission"]["meta"]["config"]["width"]
        height = info["submission"]["meta"]["config"]["height"]
        x = screen_to_graph_x(xrange[0], xrange[1], width, point[0])
        y = screen_to_graph_y(yrange[0], yrange[1], height, point[1])
        point = [x, y]
    if hl:
        return in_y_range(point[1], info)
    return in_y_range(point[1], info) and in_x_range(point[0], x1, x2)


def invert_grader_data(info_in):
    range_data = {
        "x_start": info_in["submission"]["meta"]["config"]["xrange"][0],
        "x_end": info_in["submission"]["meta"]["config"]["xrange"][1],
        "y_start": info_in["submission"]["meta"]["config"]["yrange"][0],
        "y_end": info_in["submission"]["meta"]["config"]["yrange"][1],
        "width": info_in["submission"]["meta"]["config"]["width"],
        "height": info_in["submission"]["meta"]["config"]["height"],
    }
    info = copy.deepcopy(info_in)
    submission_data = info["submission"]["gradeable"]
    for toolid in submission_data:
        for i in range(len(submission_data[toolid])):
            if "spline" in submission_data[toolid][i]:
                new_points = []
                for point in submission_data[toolid][i]["spline"]:
                    point = invert_point(point, range_data)
                    new_points.append(point)
                submission_data[toolid][i]["spline"] = new_points
            if "point" in submission_data[toolid][i]:
                submission_data[toolid][i]["point"] = invert_point(
                    submission_data[toolid][i]["point"], range_data
                )
    # info["submission"]["gradeable"] = submission_data
    info["submission"]["meta"]["config"]["xrange"] = [
        range_data["y_start"],
        range_data["y_end"],
    ]
    info["submission"]["meta"]["config"]["yrange"] = [
        range_data["x_start"],
        range_data["x_end"],
    ]
    info["submission"]["meta"]["config"]["width"] = range_data["height"]
    info["submission"]["meta"]["config"]["height"] = range_data["width"]

    yrange = info["grader"]["yrange"]
    if yrange is None:
        info["grader"]["x1"] = None
        info["grader"]["x2"] = None
    else:
        yrange = yrange.split(",")
        info["grader"]["x1"] = float(yrange[0]) if yrange[0].strip() != "" else None
        info["grader"]["x2"] = float(yrange[1]) if yrange[1].strip() != "" else None
    return info


def invert_point(point, range_data):  # point = [x,y]
    x, y = point
    # convert the point back to a graph coordinate
    x_g = screen_to_graph_x(
        x_start=range_data["x_start"],
        x_end=range_data["x_end"],
        width=range_data["width"],
        x=x,
    )
    y_g = screen_to_graph_y(
        y_start=range_data["y_start"],
        y_end=range_data["y_end"],
        height=range_data["height"],
        y=y,
    )
    # convert the swapped point to a screen coordinate with the swapped screen dimensions
    x_s = graph_to_screen_x(
        x_start=range_data["y_start"],
        x_end=range_data["y_end"],
        width=range_data["height"],
        x=y_g,
    )
    y_s = graph_to_screen_y(
        y_start=range_data["x_start"],
        y_end=range_data["x_end"],
        height=range_data["width"],
        y=x_g,
    )
    return [x_s, y_s]


def in_y_range(yval, info, tolerance=0):
    yrange = info["submission"]["meta"]["config"]["yrange"]
    return bool(yval >= yrange[0] + tolerance and yval <= yrange[1] - tolerance)


def in_x_range(xval, x1, x2, tolerance=0):
    return bool(xval >= x1 + tolerance and xval <= x2 - tolerance)
