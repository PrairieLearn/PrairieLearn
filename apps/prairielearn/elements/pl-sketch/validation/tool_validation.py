# parameters used by all tools
COMMON_VALID_PARAMS = {
    "type",
    "id",
    "label",
    "limit",
    "color",
    "helper",
    "readonly",
    "group",
}


def validate_free_draw_tool(td, name, tool_info):
    # check that only valid free draw parameters are set
    valid_params = COMMON_VALID_PARAMS
    validate_params(td, name, valid_params, "free-draw")
    # check if id/label are there for custom tools and that readonly and helper aren't both true
    check_labels(td, name)
    # reformat tool data to match the sketch response formatting
    formatted_tool = get_formatted_tool(td, "freeform", "fd", "Function f(x)", "blue")
    add_to_tool_info(formatted_tool, "freeform", tool_info)
    return formatted_tool


def validate_spline_tool(td, name, tool_info):
    valid_params = COMMON_VALID_PARAMS
    validate_params(td, name, valid_params, "spline")
    check_labels(td, name)

    formatted_tool = get_formatted_tool(td, "spline", "sp", "Spline", "purple")
    add_to_tool_info(formatted_tool, "spline", tool_info)

    return formatted_tool


def validate_line_tool(td, name, tool_info):
    valid_params = {
        "dashstyle",
        "directionconstraint",
        "lengthconstraint",
        "arrowhead",
    }.union(COMMON_VALID_PARAMS)
    validate_params(td, name, valid_params, "line")
    check_labels(td, name)

    formatted_tool = get_formatted_tool(
        td, "line-segment", "line", "Line", "red", dash_style="solid"
    )
    add_to_tool_info(formatted_tool, "line-segment", tool_info)

    return formatted_tool


def validate_point_tool(td, name, tool_info):
    valid_params = {"size", "hollow"}.union(COMMON_VALID_PARAMS)
    validate_params(td, name, valid_params, "point")
    check_labels(td, name)

    formatted_tool = get_formatted_tool(
        td, "point", "pt", "Point", "black", size=15, hollow=False
    )
    add_to_tool_info(formatted_tool, "point", tool_info)

    return formatted_tool


def validate_horizontal_line_tool(td, name, tool_info):
    valid_params = {"dashstyle"}.union(COMMON_VALID_PARAMS)
    validate_params(td, name, valid_params, "horizontal-line")
    check_labels(td, name)

    formatted_tool = get_formatted_tool(
        td,
        "horizontal-line",
        "hl",
        "Horizontal Line",
        "dimgray",
        dash_style="dashdotted",
    )
    add_to_tool_info(formatted_tool, "horizontal-line", tool_info)

    return formatted_tool


def validate_vertical_line_tool(td, name, tool_info):

    valid_params = {"dashstyle"}.union(COMMON_VALID_PARAMS)
    validate_params(td, name, valid_params, "vertical-line")
    check_labels(td, name)

    formatted_tool = get_formatted_tool(
        td, "vertical-line", "vl", "Vertical Line", "dimgray", dash_style="dashdotted"
    )
    add_to_tool_info(formatted_tool, "vertical-line", tool_info)

    return formatted_tool


def validate_polyline_tool(td, name, tool_info):
    valid_params = COMMON_VALID_PARAMS
    validate_params(td, name, valid_params, "polyline")
    check_labels(td, name)

    formatted_tool = get_formatted_tool(td, "polyline", "pline", "Polyline", "orange")
    add_to_tool_info(formatted_tool, "polyline", tool_info)

    return formatted_tool


def validate_polygon_tool(td, name, tool_info):
    valid_params = {"dashstyle", "opacity", "fillcolor"}.union(COMMON_VALID_PARAMS)
    validate_params(td, name, valid_params, "polygon")
    check_labels(td, name)

    formatted_tool = get_formatted_tool(
        td,
        "polyline",
        "pg",
        "Polygon",
        "mediumseagreen",
        opacity=0.5,
        fill_color="mediumseagreen",
    )
    add_to_tool_info(formatted_tool, "polygon", tool_info)

    return formatted_tool


# Helper Functions ###


# returns names of all parameters that are not None
def non_nonetype_params(td):
    non_nonetypes = [key for key in td if td[key] is not None]
    return set(non_nonetypes)


# basic checks for parameter relationships
def check_labels(td, name):
    check_required_labels(td, name)
    check_readonly_helper(td, name)


# readonly and helper can't both be True.
def check_readonly_helper(td, name):
    if td["readonly"] and td["helper"]:
        raise ValueError(
            name
            + ': pl-sketch-tools cannot set both the "helper" parameter and "readonly" parameter to true at once.'
        )


def check_required_labels(td, name):
    id = td["id"]
    if id is not None:
        return
    # check that user did not try to make a custom tool without id
    used_params = non_nonetype_params(td)
    ok_params = {"type", "id"}

    if len(used_params - ok_params) > 0:
        raise ValueError(name + ': Parameter "id" is required for custom tools.')
    return


def add_tag(d, default):
    if default is None:
        default = "(,)"
    d["tag"] = {
        "value": default,
        "xoffset": 15,
        "yoffset": 15,
        "align": "start",
    }


def validate_params(td, name, valid_params, tool_name):
    used_params = non_nonetype_params(td)
    extra_params = used_params - valid_params
    if len(extra_params) > 0:
        # NOTE: change grammar to match len/format nicely
        raise ValueError(
            name
            + ": The following parameter(s) are not allowed for the "
            + tool_name
            + " tool: "
            + ", ".join(list(extra_params))
        )


def get_formatted_tool(
    td,
    name,
    id,
    label,
    color,
    dash_style=None,
    size=None,
    hollow=None,
    opacity=None,
    fill_color=None,
):
    tool_type = td["type"]
    formatted_tool = {
        "name": name,
        "id": td["id"] if td["id"] is not None else id,
        "label": td["label"] if td["label"] is not None else label,
        "readonly": td["readonly"] if td["readonly"] is not None else False,
        "helper": td["helper"] if td["helper"] is not None else False,
        "limit": td["limit"],
        "group": td["group"],
        "color": td["color"] if td["color"] is not None else color,
    }
    dash_style_tools = ["line", "vertical-line", "horizontal-line"]
    if tool_type in dash_style_tools:
        formatted_tool["dashStyle"] = (
            td["dashstyle"] if td["dashstyle"] is not None else dash_style
        )

    if tool_type == "line":
        formatted_tool["directionConstraint"] = td["directionconstraint"]
        formatted_tool["lengthConstraint"] = td["lengthconstraint"]
        formatted_tool["arrowHead"] = (
            {
                "length": td["arrowhead"],
                "base": int(td["arrowhead"] * 2 / 3),
            }
            if td["arrowhead"]
            else None
        )
    elif tool_type == "point":
        formatted_tool["size"] = td["size"] if td["size"] is not None else size
        formatted_tool["hollow"] = td["hollow"] if td["hollow"] is not None else hollow
    elif tool_type == "polygon":
        formatted_tool["closed"] = True
        formatted_tool["opacity"] = (
            td["opacity"] if td["opacity"] is not None else opacity
        )
        formatted_tool["fillColor"] = (
            td["fillcolor"] if td["fillcolor"] is not None else fill_color
        )
    return formatted_tool


def add_to_tool_info(formatted_tool, type, tool_info):
    spline_types = ["freeform", "spline", "polyline"]
    toolid = formatted_tool["id"]
    tool_info[toolid] = {
        "type": type,
        "helper": formatted_tool["helper"],
        "readonly": formatted_tool["readonly"],
        "group": formatted_tool["group"],
    }
    if type in spline_types:
        tool_info[toolid]["label"] = formatted_tool["label"]
    elif type == "point":
        tool_info[toolid]["diameter"] = formatted_tool["size"]
