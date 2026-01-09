import base64
import json

import prairielearn as pl

from .model import Asymptote, GradeableFunction, LineSegment, Polygon
from .types import SketchGrader, SketchTool
from .utils import (
    flip_grader_data,
    get_coverage_length_px,
    get_gap_length_px,
    get_num_in_bound_occurrences,
    get_tools_to_check,
    parse_function_string,
    screen_to_graph_submission,
)


def grade_submission(
    grader: SketchGrader, data: pl.QuestionData, name: str
) -> tuple[float, int, list[str]]:
    submission = data["submitted_answers"][name + "-sketchresponse-submission"]
    if submission is None:
        raise ValueError("Cannot grade empty submission")

    submitted_answer = json.loads(base64.b64decode(submission).decode("utf-8"))
    tool_dict = data["params"][name]["sketch_config"]["tool_data"]
    match grader["type"]:
        case "match":
            return match(grader, submitted_answer, tool_dict)
        case "count":
            return count(grader, submitted_answer, tool_dict)
        case "match-fun":
            return match_fun(grader, submitted_answer, tool_dict)
        case "monot-increasing":
            return monot_increasing(grader, submitted_answer, tool_dict)
        case "monot-decreasing":
            return monot_decreasing(grader, submitted_answer, tool_dict)
        case "concave-up":
            return concave_up(grader, submitted_answer, tool_dict)
        case "concave-down":
            return concave_down(grader, submitted_answer, tool_dict)
        case "defined-in":
            return defined_in(grader, submitted_answer, tool_dict)
        case "undefined-in":
            return undefined_in(grader, submitted_answer, tool_dict)
        case "greater-than":
            return greater_than(grader, submitted_answer, tool_dict)
        case "less-than":
            return less_than(grader, submitted_answer, tool_dict)
        case _:
            raise ValueError(f"Unknown grader type: {grader['type']}")


def match(
    grader: SketchGrader, submission: dict, tool_dict: dict[str, SketchTool]
) -> tuple[float, int, list[str]]:
    x, y = grader["x"], grader["y"]
    feedback_value = ("x = " + str(x)) if x is not None else ("y = " + str(y))
    tolerance = grader["tolerance"]
    feedback = grader["feedback"] or f"Missing expected element at {feedback_value}."
    tools_to_check = get_tools_to_check(grader, submission, tool_dict)

    gf_tools = [
        "point",
        "spline",
        "freeform",
        "polyline",
    ]  # grading function tools (-polyline, which is considered separately)

    debug_message = []

    correct = False
    tool_grader = None
    if grader["debug"] and len(tools_to_check) == 0:
        debug_message.append("No submission found.")
    for toolid in tools_to_check:
        tool_used = tool_dict[toolid]["name"]
        if tool_used == "polygon":
            tool_grader = Polygon.Polygons(grader, submission, toolid)
            correct = tool_grader.contains_point(
                x=x, y=y, tolerance=tolerance
            )  # no tolerance for (x,y) point currently
        elif tool_used in gf_tools:
            tool_grader = GradeableFunction.GradeableFunction(
                grader, submission, toolid
            )
            if tool_used == "point":
                correct = tool_grader.has_point_at(x=x, y=y, distTolerance=tolerance)
            else:
                correct = tool_grader.has_value_at(
                    x=x, y=y, tolerance=tolerance
                )  # Note: also has x tolerance
        elif tool_used == "vertical-line":
            tool_grader = Asymptote.VerticalAsymptotes(grader, submission, toolid)
            correct = tool_grader.has_asym_at_value(x, tolerance=tolerance)
        elif tool_used == "horizontal-line":
            tool_grader = Asymptote.HorizontalAsymptotes(grader, submission, toolid)
            correct = tool_grader.has_asym_at_value(y, tolerance=tolerance)
        elif tool_used == "line-segment":
            tool_grader = LineSegment.LineSegments(grader, submission, toolid)
            if grader["endpoint"]:
                correct = tool_grader.check_eps(
                    point=[x, y], mode=grader["endpoint"], tolerance=tolerance
                )
            else:
                correct = tool_grader.has_value_at(
                    x=x, y=y, tolerance=tolerance
                )  # Note: also has x tolerance
        if grader["debug"] and tool_grader:
            debug_message += tool_grader.debugger.get_message_as_list_and_clear()
        # if the answer is still correct after calling the tool grader functions, and it's okay for any tool to have this point, break
        if correct:
            break

    score = 1 if correct else 0
    feedback = [""] if correct else [feedback, *debug_message]

    return score, grader["weight"], feedback


def match_fun(
    grader: SketchGrader, submission: dict, tool_dict: dict[str, SketchTool]
) -> tuple[float, int, list[str]]:
    tolerance = grader["tolerance"]
    feedback = grader["feedback"] or "Element does not match expected function."
    tools_to_check = get_tools_to_check(
        grader, submission, tool_dict, not_allowed=["vertical-line", "polygon"]
    )

    if grader["xyflip"]:
        grader["xrange"] = grader["yrange"]
        submission = flip_grader_data(submission)

    # This should not happen if the grader was validated correctly
    if not grader["xrange"] or not grader["fun"]:
        raise ValueError("Encountered function grader without required parameters")

    x1, x2 = grader["xrange"]
    func = parse_function_string(grader["fun"])

    debug = grader["debug"]
    debug_message = []

    correct = True
    if len(tools_to_check) == 0:
        if debug:
            debug_message.append("No submission found.")
        correct = False
    for toolid in tools_to_check:
        tool_used = tool_dict[toolid]["name"]
        tool_grader = GradeableFunction.GradeableFunction(grader, submission, toolid)
        correct = tool_grader.matches_function(func, x1, x2, tolerance)
        if not correct:
            if debug:
                debug_message += tool_grader.debugger.get_message_as_list_and_clear()
            break
        if not grader["allowundefined"] and tool_used != "point":
            correct = tool_grader.covers_function_domain(func, x1, x2, 0.9)
            if not correct:
                if grader["feedback"] is None:
                    feedback += "Your function does not cover the entire domain of the specified curve."
                if debug:
                    debug_message += (
                        tool_grader.debugger.get_message_as_list_and_clear()
                    )
                break

    score = 1 if correct else 0
    feedback = [""] if correct else [feedback, *debug_message]
    return score, grader["weight"], feedback


def count(
    grader: SketchGrader, submission: dict, tool_dict: dict[str, SketchTool]
) -> tuple[float, int, list[str]]:
    tolerance = grader["tolerance"] or 0
    feedback = grader["feedback"] or "Incorrect number of elements used."
    tools_to_check = get_tools_to_check(grader, submission, tool_dict)

    if not grader["xrange"] or not grader["count"]:
        raise ValueError("Encountered count grader without required parameters")

    mode = grader["mode"] or "exact"
    g_tol = screen_to_graph_submission(submission, True, tolerance)
    x1, x2 = grader["xrange"]
    debug = grader["debug"]
    debug_message = []

    correct = True
    if len(tools_to_check) == 0 and (
        mode != "at-most" and grader["count"] != 0
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
                submission,
                min(x1 - g_tol, x2 + g_tol),
                max(x1 - g_tol, x2 + g_tol),
            )
            num_b = get_num_in_bound_occurrences(
                toolid,
                tool_dict,
                submission,
                min(x1 + g_tol, x2 - g_tol),
                max(x1 + g_tol, x2 - g_tol),
            )
            num_c = get_num_in_bound_occurrences(toolid, tool_dict, submission, x1, x2)
            if grader["count"] not in (num_a, num_b, num_c):
                correct = False
                if debug:
                    debug_message.extend((
                        f"Found counts: {num_a}, {num_b}, {num_c} with xrange expanded by {tolerance} pixels, shrunk by {tolerance} pixels, and kept the same, respectively.",
                        f"Required exactly {grader['count']}.",
                    ))
                break
        elif mode == "at-least":
            num = get_num_in_bound_occurrences(
                toolid,
                tool_dict,
                submission,
                min(x1 - g_tol, x2 + g_tol),
                max(x1 - g_tol, x2 + g_tol),
            )
            if num < grader["count"]:
                correct = False
                if debug:
                    debug_message.extend((
                        f"Found count: {num} with xrange expanded by {tolerance} pixels.",
                        f"Required at least {grader['count']}.",
                    ))
                break
        else:
            num = get_num_in_bound_occurrences(
                toolid,
                tool_dict,
                submission,
                min(x1 + g_tol, x2 - g_tol),
                max(x1 + g_tol, x2 - g_tol),
            )
            if num > grader["count"]:
                correct = False
                if debug:
                    debug_message.extend((
                        f"Found count: {num} with xrange shrunk by {tolerance} pixels.",
                        f"Required at most {grader['count']}.",
                    ))
                break

    score = 1 if correct else 0
    feedback = [""] if correct else [feedback, *debug_message]

    return score, grader["weight"], feedback


def monot_increasing(
    grader: SketchGrader, submission: dict, tool_dict: dict[str, SketchTool]
) -> tuple[float, int, list[str]]:
    return check_monot_change(grader, submission, tool_dict, increasing=True)


def monot_decreasing(
    grader: SketchGrader, submission: dict, tool_dict: dict[str, SketchTool]
) -> tuple[float, int, list[str]]:
    return check_monot_change(grader, submission, tool_dict, increasing=False)


# Function used for both monot increasing and decreasing
def check_monot_change(
    grader: SketchGrader,
    submission: dict,
    tool_dict: dict[str, SketchTool],
    increasing: bool,
) -> tuple[float, int, list[str]]:
    i_d = "increasing" if increasing else "decreasing"
    feedback = (
        grader["feedback"]
        or "Function is not monotonically " + i_d + " in the correct domain(s)."
    )
    tools_to_check = get_tools_to_check(
        grader,
        submission,
        tool_dict,
        not_allowed=["point", "polygon", "vertical-line", "horizontal-line"],
    )

    if not grader["xrange"]:
        raise ValueError("Encountered monotonocity grader without required parameters")

    x1, x2 = grader["xrange"]
    tolerance = grader["tolerance"]

    debug = grader["debug"]
    debug_message = []

    correct = True
    num_tools_in_range = 0
    if debug and len(tools_to_check) == 0:
        debug_message.append("No submission found.")
    for toolid in tools_to_check:
        if not correct:
            break

        tool_used = tool_dict[toolid]["name"]
        if tool_used == "line-segment":
            tool_grader = LineSegment.LineSegments(grader, submission, toolid)
            if increasing:
                correct = tool_grader.is_increasing_between(x1, x2)
            else:
                correct = tool_grader.is_decreasing_between(x1, x2)
            num_tools_in_range += 1
            if debug:
                debug_message += tool_grader.debugger.get_message_as_list_and_clear()
            else:
                tool_grader = GradeableFunction.GradeableFunction(
                    grader, submission, toolid
                )
                if increasing:
                    correct = tool_grader.is_increasing_between(
                        xmin=x1, xmax=x2, numPoints=100, failureTolerance=tolerance
                    )
                else:
                    correct = tool_grader.is_decreasing_between(
                        xmin=x1, xmax=x2, numPoints=100, failureTolerance=tolerance
                    )
                num_tools_in_range += 1
                if debug:
                    debug_message += (
                        tool_grader.debugger.get_message_as_list_and_clear()
                    )

    score = 1 if (correct and num_tools_in_range > 0) else 0
    feedback = (
        [""] if (correct and num_tools_in_range > 0) else [feedback, *debug_message]
    )
    return score, grader["weight"], feedback


def concave_up(
    grader: SketchGrader, submission: dict, tool_dict: dict[str, SketchTool]
) -> tuple[float, int, list[str]]:
    return check_concavity(grader, submission, tool_dict, conc_up=True)


def concave_down(
    grader: SketchGrader, submission: dict, tool_dict: dict[str, SketchTool]
) -> tuple[float, int, list[str]]:
    return check_concavity(grader, submission, tool_dict, conc_up=False)


# Function used for both upward and downward concavity
def check_concavity(
    grader: SketchGrader,
    submission: dict,
    tool_dict: dict[str, SketchTool],
    conc_up: bool,
) -> tuple[float, int, list[str]]:
    feedback = (
        grader["feedback"]
        or "Function does not have the correct shape in the correct domain(s)."
    )
    tools_to_check = get_tools_to_check(
        grader,
        submission,
        tool_dict,
        not_allowed=["point", "polygon", "vertical-line", "horizontal-line"],
    )

    if not grader["xrange"]:
        raise ValueError("Encountered concavity grader without required parameters")

    x1, x2 = grader["xrange"]
    tolerance = grader["tolerance"]

    debug = grader["debug"]
    debug_message = []

    correct = True
    num_tools_in_range = 0
    if debug and len(tools_to_check) == 0:
        debug_message.append("No submission found.")
    for toolid in tools_to_check:
        if correct:
            tool_used = tool_dict[toolid]["name"]
            if tool_used == "line-segment":
                tool_grader = LineSegment.LineSegments(grader, submission, toolid)
                segments = tool_grader.get_segments_between_strict(xmin=x1, xmax=x2)
                if len(segments) > 0:
                    if debug:
                        debug_message.append(
                            "Found a line segment that does not have either concavity."
                        )
                    correct = False
                    break
            else:
                tool_grader = GradeableFunction.GradeableFunction(
                    grader, submission, toolid
                )
                if tool_used == "polyline":
                    in_range = tool_grader.does_exist_between(x1, x2)
                    if in_range:
                        if debug:
                            debug_message.append(
                                "Found a polyline that does not have either concavity."
                            )
                        correct = False
                        break
                else:
                    if conc_up:
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
        [""] if (correct and num_tools_in_range > 0) else [feedback, *debug_message]
    )

    return score, grader["weight"], feedback


def defined_in(
    grader: SketchGrader,
    submission: dict,
    tool_dict: dict[str, SketchTool],
) -> tuple[float, int, list[str]]:
    feedback = (
        grader["feedback"] or "Function is not defined over the expected range(s)."
    )
    tools_to_check = get_tools_to_check(
        grader,
        submission,
        tool_dict,
        not_allowed=["vertical-line", "point"],
    )

    if not grader["xrange"]:
        raise ValueError("Encountered definition grader without required parameters")

    x1, x2 = grader["xrange"]
    tolerance = grader["tolerance"]

    if len(tools_to_check) == 0:
        return 0, grader["weight"], [feedback]

    debug = grader["debug"]
    debug_message = []
    tool_grader = None

    gf_tools = ["spline", "freeform", "polyline"]
    xrange = []
    if len(tools_to_check) == 0:
        debug_message.append("No submission found.")
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
        elif tool_used == "line-segment":
            tool_grader = LineSegment.LineSegments(grader, submission, toolid)
        # add tool's range to all ranges
        if tool_grader:
            xrange += tool_grader.get_range_defined()

    if not tool_grader:
        return 0, grader["weight"], [feedback]

    rd = tool_grader.collapse_ranges(xrange)

    gap_length = get_gap_length_px(rd, x1, x2, submission)
    correct = gap_length <= tolerance
    if debug:
        debug_message.extend((
            f"Gap length is {gap_length} pixels.",
            f"Max allowed is {tolerance} pixels.",
        ))
    # #check if each 10 px interval is empty. All must be false for the range to be considered as covered.
    score = 1 if correct else 0
    feedback = [""] if correct else [feedback]
    if not correct and len(debug_message) > 0:
        feedback += debug_message
    return score, grader["weight"], feedback


def undefined_in(
    grader: SketchGrader,
    submission: dict,
    tool_dict: dict[str, SketchTool],
) -> tuple[float, int, list[str]]:
    feedback = (
        grader["feedback"]
        or "Elements found in range(s) where they were supposed to be undefined."
    )
    tools_to_check = get_tools_to_check(
        grader,
        submission,
        tool_dict,
        not_allowed=["vertical-line"],
    )

    if not grader["xrange"]:
        raise ValueError("Encountered definition grader without required parameters")

    x1, x2 = grader["xrange"]
    tolerance = grader["tolerance"]

    debug = grader["debug"]
    debug_message = []

    coverage = get_coverage_length_px(
        grader, submission, tools_to_check, tool_dict, x1, x2
    )
    correct = coverage <= tolerance
    if not correct and debug:
        debug_message.extend((
            f"{coverage} pixels not empty in xrange.",
            f"Max allowed coverage is {tolerance} pixels.",
        ))
    score = 1 if correct else 0
    feedback = [""] if correct else [feedback, *debug_message]
    return score, grader["weight"], feedback


def greater_than(
    grader: SketchGrader,
    submission: dict,
    tool_dict: dict[str, SketchTool],
) -> tuple[float, int, list[str]]:
    return check_ltgt(grader, submission, tool_dict, greater=True)


def less_than(
    grader: SketchGrader,
    submission: dict,
    tool_dict: dict[str, SketchTool],
) -> tuple[float, int, list[str]]:
    return check_ltgt(grader, submission, tool_dict, greater=False)


# used for both less than and greater than y
def check_ltgt(
    grader: SketchGrader,
    submission: dict,
    tool_dict: dict[str, SketchTool],
    greater: bool,
) -> tuple[float, int, list[str]]:
    g_l = "greater" if greater else "less"
    feedback = (
        grader["feedback"]
        or f"An element is not {g_l} than the expected function or y-value in the expected range(s)."
    )
    tools_to_check = get_tools_to_check(
        grader,
        submission,
        tool_dict,
        not_allowed=["vertical-line"],
    )

    if grader["xyflip"]:
        grader["xrange"] = grader["yrange"]
        submission = flip_grader_data(submission)

    if not grader["xrange"] or (not grader["fun"] and not grader["y"]):
        raise ValueError(
            "Encountered less/greater than grader without required parameters"
        )

    x1, x2 = grader["xrange"]

    debug = grader["debug"]
    debug_message = []

    y = grader["y"]
    func = parse_function_string(grader["fun"]) if grader["fun"] else None

    tolerance = grader["tolerance"]

    correct = True
    num_tools_in_range = 0
    if debug and len(tools_to_check) == 0:
        debug_message.append("No submission found.")
    for toolid in tools_to_check:
        if not correct:
            break

        tool_used = tool_dict[toolid]["name"]
        if tool_used == "line-segment":
            tool_grader = LineSegment.LineSegments(grader, submission, toolid)
        elif tool_used == "horizontal-line":
            tool_grader = Asymptote.HorizontalAsymptotes(grader, submission, toolid)
        elif tool_used == "polygon":
            tool_grader = Polygon.Polygons(grader, submission, toolid)
        else:
            tool_grader = GradeableFunction.GradeableFunction(
                grader, submission, toolid
            )

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
                if debug:
                    debug_message += (
                        tool_grader.debugger.get_message_as_list_and_clear()
                    )
            else:
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
                if debug:
                    debug_message += (
                        tool_grader.debugger.get_message_as_list_and_clear()
                    )
    score = 1 if (correct and num_tools_in_range > 0) else 0
    feedback = (
        [""] if (correct and num_tools_in_range > 0) else [feedback, *debug_message]
    )

    return score, grader["weight"], feedback
