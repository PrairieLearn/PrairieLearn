TOLERANCE_PX = 15
TOLERANCE_UNDEF_RANGE = 10
TOLERANCE_UNDEF_POINT = 10
TOLERANCE_FUNC = 20
TOLERANCE_MONOT = 5
TOLERANCE_CONCAVE = 10
TOLERANCE_DEF = 20
TOLERANCE_ANGLE = 10
STAGE_DEFAULT = -1

COMMON_VALID_PARAMS = {
    "type",
    "toolid",
    "tolerance",
    "weight",
    "stage",
    "feedback",
    "debug",
}


# Validates the match grader
def validate_match(gd, name, tool_info, yrange):
    valid_params = {"x", "y", "endpoint"}.union(COMMON_VALID_PARAMS)
    used_params = validate_params(valid_params, gd, name)

    if "toolid" in used_params:
        validate_toolid(gd, name, tool_info)
        for tid in gd["toolid"].split(","):
            tool_id = tid.strip()
            if tool_info[tool_id]["type"] == "horizontal-line":
                error_message = (
                    name
                    + ": grader "
                    + gd["type"]
                    + " must have 'y' parameter for the horizontal-line tool."
                )
                validate_required_params(
                    gd, name, {"y"}, used_params, error_message=error_message
                )
            elif tool_info[tool_id]["type"] == "vertical-line":
                error_message = (
                    name
                    + ": grader "
                    + gd["type"]
                    + " must have 'x' parameter for the vertical-line tool."
                )
                validate_required_params(
                    gd, name, {"x"}, used_params, error_message=error_message
                )
            else:
                error_message = (
                    name
                    + ": grader "
                    + gd["type"]
                    + " must have 'x' or 'y' parameters. "
                )
                validate_required_params(
                    gd,
                    name,
                    {"x", "y"},
                    used_params,
                    all_required=False,
                    error_message=error_message,
                )
            if (
                "endpoint" in used_params
                and tool_info[tool_id]["type"] != "line-segment"
            ):
                raise ValueError(
                    name
                    + ": The 'endpoint' parameter can only be used to grade the line tool."
                )
    elif "endpoint" in used_params and gd["endpoint"]:
        raise ValueError(
            name
            + ": The 'toolid' parameter must be set if the 'endpoint' parameter is."
        )

    if "endpoint" in used_params:
        allowed_endpoint_values = ["either", "start", "end"]
        gd["endpoint"] = gd["endpoint"].strip()
        if gd["endpoint"] not in allowed_endpoint_values:
            raise ValueError(
                name + ": The 'endpoint' parameter must be 'either', 'start', or 'end'."
            )
        if "x" not in used_params or "y" not in used_params:
            raise ValueError(
                name
                + ": When the 'endpoint' parameter is set, both 'x' and 'y' must be set."
            )

    # special tolerance for points
    pt_tolerance = get_point_tolerance(gd, tool_info, used_params)

    if "tolerance" in used_params:
        validate_tolerance(gd, name)
    else:
        gd["tolerance"] = TOLERANCE_PX

    # also check oob x
    if "y" in used_params:
        y = float(gd["y"])
        if y < yrange[0] or y > yrange[1]:
            raise ValueError(
                name
                + ": grader "
                + gd["type"]
                + " has an out of bounds 'y' parameter: "
                + str(y)
                + "."
            )

    validate_stage(name, gd)

    grader = {
        "type": gd["type"],
        "toolid": gd["toolid"],
        "x": gd["x"],
        "y": gd["y"],
        "endpoint": gd["endpoint"] if gd["endpoint"] is not None else False,
        "tolerance": gd["tolerance"],
        "pt_tolerance": pt_tolerance,
        "weight": gd["weight"],
        "stage": gd["stage"],
        "feedback": gd["feedback"],
        "debug": gd["debug"],
    }
    return grader


# Validates the count grader
def validate_count(gd, name, tool_info):
    valid_params = {"count", "mode", "xrange"}.union(COMMON_VALID_PARAMS)
    used_params = validate_params(valid_params, gd, name)
    # important: make sure to call this before the other validation functions that rely on x1 and x2
    set_x1x2(gd)

    if "toolid" in used_params:
        validate_toolid(gd, name, tool_info)

    validate_required_params(gd, name, {"count"}, used_params)

    allowed_modes = ["exact", "at-least", "at-most"]
    if gd["mode"] and gd["mode"].lower().strip() not in allowed_modes:
        raise ValueError(
            name
            + ": grader "
            + gd["type"]
            + ' "mode" parameter must be "exact", "at-least", or "at-most".'
        )

    validate_stage(name, gd)
    swap_x(gd)

    if "tolerance" in used_params:
        validate_tolerance(gd["tolerance"], name)
    else:
        gd["tolerance"] = TOLERANCE_PX

    grader = {
        "type": gd["type"],
        "toolid": gd["toolid"],
        "count": gd["count"],
        "mode": gd["mode"].lower() if gd["mode"] is not None else "exact",
        "x1": gd["x1"],
        "x2": gd["x2"],
        "tolerance": gd["tolerance"],
        "stage": gd["stage"],
        "weight": gd["weight"],
        "feedback": gd["feedback"],
        "debug": gd["debug"],
    }
    return grader


# Validates the concave*, monot*, and defined-in graders
def validate_2p_range(gd, name, tool_info, ranges):  # concaves, monots, and defined-in
    valid_params = {"xrange"}.union(COMMON_VALID_PARAMS)
    used_params = validate_params(valid_params, gd, name)
    set_x1x2(gd)

    if "toolid" in used_params:
        validate_toolid(gd, name, tool_info)
        if gd["type"] == "defined-in":
            allowed_tools = [
                "line-segment",
                "polyline",
                "polygon",
                "freeform",
                "spline",
                "horizontal-line",
            ]
            error_message = (
                name
                + ": grader "
                + gd["type"]
                + " does not allow the point and vertical-line tools."
            )
            validate_tools(gd, name, allowed_tools, tool_info, error_message)
        else:
            allowed_tools = ["line-segment", "polyline", "freeform", "spline"]
            error_message = (
                name
                + ": grader "
                + gd["type"]
                + " only allows the free-draw, spline, line, and polyline tools."
            )
            validate_tools(gd, name, allowed_tools, tool_info, error_message)

    if "tolerance" in used_params:
        if gd["type"].startswith("defined"):
            validate_tolerance(gd, name, xrange_check=True, ranges=ranges)
    elif gd["type"].startswith("monot"):
        gd["tolerance"] = TOLERANCE_MONOT
    elif gd["type"].startswith("concave"):
        gd["tolerance"] = TOLERANCE_CONCAVE
    else:
        gd["tolerance"] = TOLERANCE_DEF

    validate_stage(name, gd)
    swap_x(gd)

    grader = {
        "type": gd["type"],
        "toolid": gd["toolid"],
        "x1": gd["x1"],
        "x2": gd["x2"],
        "tolerance": gd["tolerance"],
        "stage": gd["stage"],
        "weight": gd["weight"],
        "feedback": gd["feedback"],
        "debug": gd["debug"],
    }
    return grader


# Validates the undefined-in grader
def validate_undefined_in(gd, name, tool_info, ranges):
    valid_params = {"xrange"}.union(COMMON_VALID_PARAMS)
    used_params = validate_params(valid_params, gd, name)
    set_x1x2(gd)

    if "toolid" in used_params:
        validate_toolid(gd, name, tool_info)

    if gd["x1"] and gd["x2"] and gd["x1"] == gd["x2"]:
        if "tolerance" in used_params:
            validate_tolerance(gd, name)
        else:
            gd["tolerance"] = TOLERANCE_UNDEF_POINT
    elif "tolerance" in used_params:
        validate_tolerance(gd, name, xrange_check=True, ranges=ranges)
    else:
        gd["tolerance"] = shrink_xrange_tolerance(
            TOLERANCE_UNDEF_RANGE, gd["x1"], gd["x2"], ranges
        )

    validate_stage(name, gd)
    swap_x(gd)

    grader = {
        "type": gd["type"],
        "toolid": gd["toolid"],
        "x1": gd["x1"],
        "x2": gd["x2"],
        "tolerance": gd["tolerance"],
        "stage": gd["stage"],
        "weight": gd["weight"],
        "feedback": gd["feedback"],
        "debug": gd["debug"],
    }

    return grader


# Validates the match-fun grader
def validate_match_fun(gd, name, tool_info):
    valid_params = {
        "fun",
        "funxyswap",
        "yrange",
        "allowundefined",
        "xrange",
    }.union(COMMON_VALID_PARAMS)
    used_params = validate_params(valid_params, gd, name)
    set_x1x2(gd)

    validate_required_params(gd, name, {"fun"}, used_params)

    if "toolid" in used_params:
        validate_toolid(gd, name, tool_info)
        allowed_tools = ["point", "spline", "freeform", "polyline"]
        error_message = (
            name
            + ": grader "
            + gd["type"]
            + " only allows the point, spline, free-draw, and polyline tools."
        )
        validate_tools(gd, name, allowed_tools, tool_info, error_message)

    validate_x_y_swap(gd, name)

    pt_tolerance = get_point_tolerance(gd, tool_info, used_params)
    if "tolerance" in used_params:
        validate_tolerance(gd, name)
    else:
        gd["tolerance"] = TOLERANCE_FUNC

    validate_stage(name, gd)
    swap_x(gd)

    grader = {
        "type": gd["type"],
        "toolid": gd["toolid"],
        "fun": gd["fun"],
        "funxyswap": gd["funxyswap"] if gd["funxyswap"] is not None else False,
        "yrange": gd["yrange"],
        "allowundefined": gd["allowundefined"]
        if gd["allowundefined"] is not None
        else True,
        "x1": gd["x1"],
        "x2": gd["x2"],
        "stage": gd["stage"],
        "tolerance": gd["tolerance"],
        "pt_tolerance": pt_tolerance,
        "weight": gd["weight"],
        "feedback": gd["feedback"],
        "debug": gd["debug"],
    }
    return grader


# Validates the less-than and greater-than graders
def validate_ltgt(gd, name, tool_info):
    valid_params = {
        "y",
        "fun",
        "funxyswap",
        "yrange",
        "allowundefined",
        "xrange",
    }.union(COMMON_VALID_PARAMS)
    used_params = validate_params(valid_params, gd, name)
    set_x1x2(gd)

    validate_required_params(
        gd,
        name,
        {"y", "fun"},
        used_params,
        all_required=False,
        error_message=(
            name + ': either "y" or "fun" must be set in grader ' + gd["type"] + "."
        ),
    )
    if "y" in used_params and "x" in used_params:
        raise ValueError(
            name + ': only one of "y" or "fun" can be set in grader ' + gd["type"] + "."
        )

    if "toolid" in used_params:
        validate_toolid(gd, name, tool_info)
        allowed_tools = [
            "point",
            "line-segment",
            "spline",
            "freeform",
            "polyline",
            "polygon",
            "horizontal-line",
        ]
        error_message = (
            name + ": grader " + gd["type"] + " does not allow the vertical-line tool."
        )
        validate_tools(gd, name, allowed_tools, tool_info, error_message)

    if "fun" in used_params:
        validate_x_y_swap(gd, name)

    if "tolerance" in used_params:
        validate_tolerance(gd, name)
    elif "fun" in used_params:
        gd["tolerance"] = TOLERANCE_FUNC
    else:
        gd["tolerance"] = TOLERANCE_PX

    validate_stage(name, gd)
    swap_x(gd)

    grader = {
        "type": gd["type"],
        "toolid": gd["toolid"],
        "y": gd["y"],
        "fun": gd["fun"],
        "funxyswap": gd["funxyswap"] if gd["funxyswap"] is not None else False,
        "yrange": gd["yrange"],
        "x1": gd["x1"],
        "x2": gd["x2"],
        "tolerance": gd["tolerance"],
        "stage": gd["stage"],
        "weight": gd["weight"],
        "feedback": gd["feedback"],
        "debug": gd["debug"],
    }
    return grader


def validate_match_length(gd, name, tool_info):
    return validate_vector_graders(gd, name, tool_info, "length")


def validate_match_angle(gd, name, tool_info):
    return validate_vector_graders(gd, name, tool_info, "angle")


def validate_vector_graders(gd, name, tool_info, a_or_l):
    valid_params = {a_or_l, "allowflip"}.union(COMMON_VALID_PARAMS)
    used_params = validate_params(valid_params, gd, name)

    required_params = {"toolid", a_or_l}
    validate_required_params(gd, name, required_params, used_params)

    validate_toolid(gd, name, tool_info)
    validate_tools(gd, name, ["line-segment"], tool_info, error_message=None)
    validate_stage(name, gd)

    if "tolerance" in used_params:
        validate_tolerance(gd, name)
    elif a_or_l == "angle":
        gd["tolerance"] = TOLERANCE_ANGLE
    else:
        gd["tolerance"] = TOLERANCE_PX

    grader = {
        "type": gd["type"],
        "toolid": gd["toolid"],
        a_or_l: gd[a_or_l],
        "tolerance": gd["tolerance"],
        "stage": gd["stage"],
        "weight": gd["weight"],
        "feedback": gd["feedback"],
        "debug": gd["debug"],
    }
    if a_or_l == "angle":
        if "allowflip" not in used_params:
            grader["allowflip"] = False
        else:
            grader["allowflip"] = gd["allowflip"]
    return grader


# Helper Functions ###


def non_nonetype_params(gd):
    non_nonetypes = []
    for key in gd:
        if gd[key] is not None:
            non_nonetypes.append(key)
    return set(non_nonetypes)


def validate_params(valid_params, gd, name):
    used_params = non_nonetype_params(gd)
    if len(used_params - valid_params) > 0:
        raise ValueError(
            name
            + ": grader '"
            + gd["type"]
            + "' only allows parameter(s): "
            + ", ".join(list(valid_params))
            + "."
        )
    return used_params


def set_x1x2(gd):
    xrange = gd["xrange"]
    gd["x1"] = split_x_range(xrange, 0)
    gd["x2"] = split_x_range(xrange, 1)


def split_x_range(xrange, index):
    if xrange is None:
        return None
    xlist = xrange.split(",")
    if len(xlist) != 2:
        raise ValueError(
            'xrange must have one of the following formats: "x1,x2", "x1,", or ",x2".'
        )
    x_val = xlist[index]
    if x_val.strip() == "":
        return None
    else:
        return float(x_val)


def validate_required_params(
    gd, name, required_params, used_params, all_required=True, error_message=None
):
    if all_required:
        if used_params.intersection(required_params) != required_params:
            if error_message:
                raise ValueError(error_message)
            raise ValueError(
                name
                + ": grader '"
                + gd["type"]
                + "' requires the parameter(s): "
                + ", ".join(list(required_params))
                + "."
            )
    elif len(used_params.intersection(required_params)) == 0:
        if error_message:
            raise ValueError(error_message)
        raise ValueError(
            name
            + ": grader '"
            + gd["type"]
            + "' requires one of the following parameters: "
            + ", ".join(list(required_params))
            + "."
        )


def swap_x(gd):
    if gd["x1"] and gd["x2"] and gd["x1"] > gd["x2"]:
        x1 = gd["x2"]
        gd["x2"] = gd["x1"]
        gd["x1"] = x1


def validate_toolid(gd, name, tool_info):
    toolid = gd["toolid"]
    toolids = [t.strip() for t in toolid.split(",")]
    for id in toolids:
        if id not in tool_info:
            raise ValueError(
                name
                + ": grader '"
                + gd["type"]
                + '\' has an invalid id in "toolid": '
                + id
                + "."
            )


def validate_tools(gd, name, tools_allowed, tool_info, error_message=None):
    toolids = [tool.strip() for tool in gd["toolid"].split(",")]
    tools_used = [tool_info[tid]["type"] for tid in toolids]
    tools_allowed = set(tools_allowed)
    tools_used = set(tools_used)
    if len(tools_used - tools_allowed) > 0:
        if error_message:
            raise ValueError(error_message)
        raise ValueError(
            name
            + ': one or more of the tools specified by the "toolid" parameter in grader '
            + gd["type"]
            + " is not supported for this grader."
        )
    for tid in toolids:
        if tool_info[tid]["helper"]:
            raise ValueError(
                name
                + ": tool with id "
                + id
                + " in grader '"
                + gd["type"]
                + "' cannot be graded because it is a helper tool."
            )


def validate_tolerance(gd, name, xrange_check=False, ranges=None):
    tolerance = gd["tolerance"]
    if tolerance is None:
        return
    if tolerance < 1:
        raise ValueError(
            name + ': "tolerance" parameter must be 1 or greater for all graders.'
        )
    if xrange_check:
        if not ranges:
            raise ValueError(name + ": cannot check xrange without a range provided.")
        x1 = gd["x1"]
        x2 = gd["x2"]
        scale = abs(ranges["x_end"] - ranges["x_start"]) / ranges["width"]
        tenpx = 10 * scale
        tol = tolerance * scale
        if x1 is None:
            x1 = ranges["x_start"] + tenpx
        if x2 is None:
            x2 = ranges["x_end"] - tenpx
        if x2 - tol < x1 or x1 + tol > x2:
            raise ValueError(
                name
                + ": One of your tolerances for grader '"
                + gd["type"]
                + "', "
                + str(tolerance)
                + ", is too high for range ["
                + str(x1)
                + ", "
                + str(x2)
                + "], and will lead to all answers being accepted."
            )
    return


def get_point_tolerance(gd, tool_info, used_params):
    pt_tolerance = gd["tolerance"]
    for tid in gd["toolid"].split():
        tool_id = tid.strip()
        if tool_info[tool_id]["type"] == "point" and "tolerance" not in used_params:
            pt_tolerance = int(tool_info[tool_id]["diameter"] / 2) + 3
    return pt_tolerance


# TODO: handle undef x values
def shrink_xrange_tolerance(tolerance, x1, x2, ranges):
    if not x1 or not x2:
        return tolerance
    scale = ranges["width"] / abs(ranges["x_end"] - ranges["x_start"])
    xrange = abs(x2 - x1)
    xrange_px = xrange * scale
    if tolerance * 2 > xrange_px:
        return 2
    return tolerance


def validate_x_y_swap(gd, name):
    if gd["fun"] is None:
        if gd["funxyswap"]:
            raise ValueError(
                name
                + ": Parameter 'fun-x-y-swap' in "
                + gd["type"]
                + " grader is set to True, but the 'fun' parameter is not set."
            )
        return
    if "y" in gd["fun"]:
        if not gd["funxyswap"]:
            raise ValueError(
                name
                + ": Your function in grader "
                + gd["type"]
                + ", "
                + gd["fun"]
                + ", has the variable y. If you want this to be a function of y, set 'fun-x-y-swap' to True."
            )
        if gd["x1"] is not None or gd["x2"] is not None:
            raise ValueError(
                name
                + ": For functions defined in terms of y for grader "
                + gd["type"]
                + ", use 'yrange' instead of 'xrange'. "
            )
    if gd["funxyswap"] and "x" in gd["fun"]:
        raise ValueError(
            name
            + ": 'fun-x-y-swap' is set to True in grader "
            + gd["type"]
            + ", so the function should be written in terms of 'y' instead of 'x'."
        )
    yrange = gd["yrange"]
    if yrange is None:
        return
    yrange = yrange.split(",")
    if len(yrange) != 2:
        raise ValueError(
            name
            + ": parameter 'yrange' in grader "
            + gd["type"]
            + " should be declared as a comma separated list of floats, ex. '0,1', ',0', or '0,'."
        )
    try:
        _ = [float(y) for y in yrange if y.strip() != ""]
    except Exception:
        raise ValueError(
            name
            + ": parameter 'yrange' in grader "
            + gd["type"]
            + " should be declared as a comma separated list of floats, ex. '0,1', ',0', or '0,'."
        ) from None


def validate_stage(name, gd):
    stage = gd["stage"]
    if stage is None:
        gd["stage"] = STAGE_DEFAULT
        return
    if stage < 0:
        raise ValueError(name + ': "stage" cannot be negative.')
