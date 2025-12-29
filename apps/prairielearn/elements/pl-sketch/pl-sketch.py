import base64
import json
import random
import string
from typing import TypedDict

import chevron
import lxml.html
import prairielearn as pl
from grading.grade_modes import grade_submission
from grading.model.fit_curve import fitCurve
from grading.utils import (
    function_to_spline,
    graph_to_screen_x,
    graph_to_screen_y,
    parse_function_string,
    screen_to_graph_dist,
)
from validation.grader_validation import (
    validate_2p_range,
    validate_count,
    validate_ltgt,
    validate_match,
    validate_match_angle,
    validate_match_fun,
    validate_match_length,
    validate_undefined_in,
)
from validation.initial_validation import (
    validate_initial_n_points,
    validate_initial_set_points,
)
from validation.tool_validation import (
    validate_free_draw_tool,
    validate_horizontal_line_tool,
    validate_line_tool,
    validate_point_tool,
    validate_polygon_tool,
    validate_polyline_tool,
    validate_spline_tool,
    validate_vertical_line_tool,
)

WEIGHT_DEFAULT = 1
XRANGE_DEFAULT = "-5,5"
YRANGE_DEFAULT = "-5,5"
WIDTH_DEFAULT = 800
HEIGHT_DEFAULT = 450
ENFORCE_BOUNDS_DEFAULT = False
READ_ONLY_DEFAULT = False
COORDINATES_DEFAULT = "cartesian"
ADD_DEFAULT_TOOLS_DEFAULT = False
ALLOW_BLANK_DEFAULT = False


# tool, graders, initials definitions
class SketchTool(TypedDict):
    type: str
    id: str | None
    label: str | None
    color: str | None
    readonly: bool | None
    helper: bool | None
    limit: int | None
    group: str | None
    dashstyle: str | None
    directionconstraint: str | None
    lengthconstraint: float | None
    size: int | None
    hollow: bool | None
    opacity: float | None
    closed: bool | None
    fillcolor: str | None
    arrowhead: int | None
    src: str | None
    scale: float | None
    align: str | None


class Grader(TypedDict):
    type: str | None
    toolid: str | None
    x: float | str | None
    y: float | None
    endpoint: bool | None
    xrange: str | None
    count: int | None
    fun: str | None
    funxyswap: bool | None
    yrange: str | None
    mode: str | None
    allowundefined: bool | None
    angle: int | None
    allowflip: bool | None
    length: float | None
    weight: int | None
    stage: int | None
    tolerance: int | None
    feedback: str | None
    debug: bool | None


class Initial(TypedDict):
    toolid: str
    fun: str | None
    xrange: str | None
    coordinates: str | None


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["answers-name"]
    optional_attribs = [
        "weight",
        "xrange",
        "yrange",
        "graph-width",
        "graph-height",
        "enforce-bounds",
        "read-only",
        "allow-blank",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)

    name = pl.get_string_attrib(element, "answers-name")
    pl.check_answers_names(data, name)

    # xrange check
    x_range_str = pl.get_string_attrib(element, "xrange", XRANGE_DEFAULT)
    try:
        x_range_ls = [float(x) for x in x_range_str.split(",")]
    except Exception:
        raise ValueError(
            'xrange attribute requires a comma separated list of two x values, ex. "0,4".'
        ) from None
    if len(x_range_ls) != 2:
        raise ValueError(
            'xrange attribute requires a comma separated list of two x values, ex. "0,4".'
        )
    if x_range_ls[0] == x_range_ls[1]:
        raise ValueError(
            'xrange attribute requires a comma separated list of two different x values, ex. "0,4".'
        )
    if x_range_ls[0] > x_range_ls[1]:
        raise ValueError("xrange values must be listed in ascending order.")

    # yrange check
    y_range_str = pl.get_string_attrib(element, "yrange", YRANGE_DEFAULT)
    try:
        y_range_ls = [float(y) for y in y_range_str.split(",")]
    except Exception:
        raise ValueError(
            'yrange attribute requires a comma separated list of two y values, ex. "0,4".'
        ) from None
    if len(y_range_ls) != 2:
        raise ValueError(
            'yrange attribute requires a comma separated list of two y values, ex. "0,4".'
        )
    if y_range_ls[0] == x_range_ls[1]:
        raise ValueError(
            'yrange attribute requires a comma separated list of two different y values, ex. "0,4".'
        )
    if y_range_ls[0] > y_range_ls[1]:
        raise ValueError("yrange values must be listed in ascending order.")

    # configuring data
    data["params"][name] = {
        "sketch_config": {
            "plugins": None,
            "tool_info": None,
            "initial_state": None,
            "ranges": None,
            "graders": None,
        }
    }

    read_only = pl.get_boolean_attrib(element, "read-only", READ_ONLY_DEFAULT)

    tools: list = []
    tool_info = {}  # tool_info: dictionary, will be edited in the tool validation functions
    tool_groups = {}
    for html_tag in element:
        if html_tag.tag == "pl-sketch-tool":
            tool_dict = {
                "type": str(html_tag.get("type"))
                if html_tag.get("type", None) is not None
                else None,
                "id": str(html_tag.get("id"))
                if html_tag.get("id", None) is not None
                else None,
                "label": str(html_tag.get("label"))
                if html_tag.get("label", None) is not None
                else None,
                "color": str(html_tag.get("color"))
                if html_tag.get("color", None) is not None
                else None,
                "readonly": check_bool_tag_param(html_tag.get("read-only", None)),
                "limit": int(html_tag.get("limit"))
                if html_tag.get("limit", None) is not None
                else None,
                "helper": check_bool_tag_param(html_tag.get("helper", None)),
                "group": html_tag.get("group", None),
                "dashstyle": str(html_tag.get("dash-style"))
                if html_tag.get("dash-style", None) is not None
                else None,
                "directionconstraint": str(html_tag.get("direction-constraint"))
                if html_tag.get("direction-constraint", None) is not None
                else None,
                "lengthconstraint": float(html_tag.get("length-constraint"))
                if html_tag.get("length-constraint", None) is not None
                else None,
                "size": int(html_tag.get("size"))
                if html_tag.get("size", None) is not None
                else None,
                "hollow": check_bool_tag_param(html_tag.get("hollow", None)),
                "opacity": float(html_tag.get("fill-opacity"))
                if html_tag.get("fill-opacity", None) is not None
                else None,
                "closed": check_bool_tag_param(html_tag.get("closed", None)),
                "fillcolor": str(html_tag.get("fill-color"))
                if html_tag.get("fill-color", None) is not None
                else None,
                "arrowhead": int(html_tag.get("arrowhead"))
                if html_tag.get("arrowhead", None) is not None
                else None,
                "src": str(html_tag.get("src"))
                if html_tag.get("src", None) is not None
                else None,
                "scale": float(html_tag.get("scale"))
                if html_tag.get("scale", None) is not None
                else None,
                "align": str(html_tag.get("align"))
                if html_tag.get("align", None) is not None
                else None,
            }
            tool = check_tool(tool_dict, name, tool_info)
            group = tool["group"]
            if group is None:
                tools.append(tool)
            elif group not in tool_groups:
                tool_groups[group] = [tool]
            else:
                tool_groups[group].append(tool)
    for group, plugins in tool_groups.items():
        group_formatted = {
            "name": "group",
            "id": group,
            "label": group,
            "plugins": plugins,
        }
        tools.append(group_formatted)

    # add default tools if requested by user
    if len(tools) == 0:
        fd = {"name": "freeform", "id": "fd", "label": "Function f(x)", "color": "blue"}
        tool_info["fd"] = {
            "type": "free-draw",
            "helper": False,
            "readonly": False,
            "label": "Function f(x)",
            "group": None,
        }
        tools.append(fd)

    data["params"][name]["sketch_config"]["tool_info"] = tool_info

    # add default axes configurations
    axes_plugins = {
        "name": "axes",
        "xaxisLabel": {"value": "x", "dx": 10, "dy": 10},
        "yaxisLabel": {
            "value": "y",
            "dx": 10,
            "dy": 20,
        },
        "colors": {"xaxisLabel": "blue", "yaxisLabel": "blue"},
        "fontSize": {"xaxisLabel": 14, "yaxisLabel": 14},
    }

    # combine tool configs with axes configs
    tools.insert(0, axes_plugins)

    data["params"][name]["sketch_config"]["plugins"] = tools

    # check maximum width of canvas
    num_tools = len([
        tool_id
        for tool_id in tool_info
        if not tool_info[tool_id]["readonly"]
        and not tool_info[tool_id]["helper"]
        and not tool_info[tool_id]["group"]
    ])
    num_tools += len(tool_groups)
    if num_tools > 7:
        raise ValueError(
            "A maximum of 7 non-helper sketch tools and dropdown groups is allowed."
        )

    min_width = 240 + 70 * num_tools
    if read_only:
        min_width = 240

    # width height check (this is based on the number of tools)
    width = pl.get_integer_attrib(element, "graph-width", None)
    if width is not None:
        if width > 900:
            raise ValueError("graph-width must be less than or equal to 900.")
        if width < min_width:
            raise ValueError(
                "graph-width must be at least "
                + str(min_width)
                + ". This value is based on the number of tools you are using."
            )
    else:
        width = WIDTH_DEFAULT
    height = pl.get_integer_attrib(element, "graph-height", HEIGHT_DEFAULT)

    # set the x and y ranges, add 10px margins
    x_range_str = pl.get_string_attrib(element, "xrange", XRANGE_DEFAULT)
    x_range_ls = [float(x) for x in x_range_str.split(",")]
    x_start = x_range_ls[0]
    x_end = x_range_ls[1]

    xscale = (x_end - x_start) / (width - 20)
    ten_px_margin = 10 * xscale
    x_start -= ten_px_margin
    x_end += ten_px_margin

    y_range_str = pl.get_string_attrib(element, "yrange", YRANGE_DEFAULT)
    y_range_ls = [float(y) for y in y_range_str.split(",")]
    y_start = y_range_ls[0]
    y_end = y_range_ls[1]

    yscale = (y_end - y_start) / (height - 20)
    ten_px_margin = 10 * yscale

    y_start -= ten_px_margin
    y_end += ten_px_margin

    data["params"][name]["sketch_config"]["ranges"] = {
        "x_start": x_start,
        "x_end": x_end,
        "y_start": y_start,
        "y_end": y_end,
        "width": width,
        "height": height,
    }

    # validate and set graders and initial values
    graders: list = []
    initials: list = []

    for html_tag in element:
        if html_tag.tag == "pl-sketch-grade":
            grader_dict: Grader = {
                "type": html_tag.get("type", None),
                "toolid": html_tag.get("toolid", None),
                "x": float(html_tag.get("x"))
                if html_tag.get("x", None) is not None
                else None,
                "y": float(html_tag.get("y"))
                if html_tag.get("y", None) is not None
                else None,
                "endpoint": html_tag.get("endpoint", None),
                "xrange": html_tag.get("xrange", None),
                "count": int(html_tag.get("count"))
                if html_tag.get("count", None) is not None
                else None,
                "fun": html_tag.get("fun", None),
                "funxyswap": check_bool_tag_param(html_tag.get("fun-x-y-swap", None)),
                "yrange": html_tag.get("yrange", None),
                "mode": html_tag.get("mode", None),
                "allowundefined": check_bool_tag_param(
                    html_tag.get("allow-undefined", None)
                ),
                "angle": int(html_tag.get("angle"))
                if html_tag.get("angle", None) is not None
                else None,
                "allowflip": check_bool_tag_param(html_tag.get("allow-flip", None)),
                "length": float(html_tag.get("length"))
                if html_tag.get("length", None) is not None
                else None,
                "weight": int(html_tag.get("weight"))
                if html_tag.get("weight", None) is not None
                else WEIGHT_DEFAULT,
                "stage": int(html_tag.get("stage"))
                if html_tag.get("stage", None) is not None
                else None,
                "tolerance": int(html_tag.get("tolerance"))
                if html_tag.get("tolerance", None) is not None
                else None,
                "feedback": html_tag.get("feedback", None),
                "debug": check_bool_tag_param(html_tag.get("debug", None)),
            }
            grader = check_grader(grader_dict, name, data)
            graders.append(grader)
        elif html_tag.tag == "pl-sketch-initial":
            initial_dict: Initial = {
                "toolid": str(html_tag.get("toolid")),
                "fun": str(html_tag.get("fun"))
                if html_tag.get("fun", None) is not None
                else None,
                "xrange": str(html_tag.get("xrange"))
                if html_tag.get("xrange", None) is not None
                else None,
                "coordinates": str(html_tag.get("coordinates"))
                if html_tag.get("coordinates", None) is not None
                else None,
            }
            initial = check_initial(
                initial_dict,
                name,
                tool_info,
                data["params"][name]["sketch_config"]["ranges"],
            )
            initials.append(initial)

    data["params"][name]["sketch_config"]["graders"] = graders
    initial_ids = {initial["toolid"] for initial in initials}
    data["params"][name]["sketch_config"]["initial_state"] = {
        id: format_initials(initials, id, tool_info, data, name) for id in initial_ids
    }


# Data formatting helper functions ####
def check_bool_tag_param(param):
    if param is None:
        return None
    if param.lower() == "true":
        return True
    if param.lower() == "false":
        return False
    else:
        raise ValueError("Invalid value set for boolean parameter.")


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


def check_tool(td, name, tool_info):
    # check that required parameters are there for all
    tool_type = td["type"]
    if tool_type is None:
        raise ValueError(name + ': Missing required parameter for tool: "type".')
    valid_tools = [
        "line",
        "free-draw",
        "spline",
        "point",
        "horizontal-line",
        "vertical-line",
        "polyline",
        "polygon",
    ]
    if tool_type not in valid_tools:
        raise ValueError(name + ": Invalid tool type used: " + tool_type)
    if td["id"] in tool_info:
        raise ValueError(name + ": Duplicate toolid : " + td["id"])
    match tool_type:
        case "free-draw":
            return validate_free_draw_tool(td, name, tool_info)
        case "spline":
            return validate_spline_tool(td, name, tool_info)
        case "line":
            return validate_line_tool(td, name, tool_info)
        case "point":
            return validate_point_tool(td, name, tool_info)
        case "horizontal-line":
            return validate_horizontal_line_tool(td, name, tool_info)
        case "vertical-line":
            return validate_vertical_line_tool(td, name, tool_info)
        case "polyline":
            return validate_polyline_tool(td, name, tool_info)
        case "polygon":
            return validate_polygon_tool(td, name, tool_info)
        case _:
            raise ValueError(name + ": Invalid tool type used.")


def check_grader(gd, name, data):
    g_type = gd["type"]
    if g_type is None:
        raise ValueError(name + ': Missing required parameter for grader: "type".')
    valid_types = [
        "monot-increasing",
        "monot-decreasing",
        "concave-up",
        "concave-down",
        "defined-in",
        "match",
        "undefined-in",
        "greater-than",
        "less-than",
        "count",
        "match-fun",
        "match-length",
        "match-angle",
    ]
    if g_type not in valid_types:
        raise ValueError(
            name
            + ': Incorrect value for "type" parameter. Allowed types are : '
            + str(valid_types)
            + "."
        )

    two_point_range_graders = [
        "monot-increasing",
        "monot-decreasing",
        "concave-up",
        "concave-down",
        "defined-in",
    ]
    tool_info = data["params"][name]["sketch_config"]["tool_info"]

    if g_type in two_point_range_graders:
        return validate_2p_range(
            gd, name, tool_info, data["params"][name]["sketch_config"]["ranges"]
        )
    elif g_type == "match":
        yrange = [
            data["params"][name]["sketch_config"]["ranges"]["y_start"],
            data["params"][name]["sketch_config"]["ranges"]["y_end"],
        ]
        return validate_match(gd, name, tool_info, yrange)
    elif g_type == "count":
        return validate_count(gd, name, tool_info)
    elif g_type == "undefined-in":
        return validate_undefined_in(
            gd, name, tool_info, data["params"][name]["sketch_config"]["ranges"]
        )
    elif g_type == "match-fun":
        return validate_match_fun(gd, name, tool_info)
    elif g_type == "match-length":
        return validate_match_length(gd, name, tool_info)
    elif g_type == "match-angle":
        return validate_match_angle(gd, name, tool_info)
    else:
        return validate_ltgt(gd, name, tool_info)


def check_initial(ind, name, tool_info, ranges):
    # check that toolid parameter there for all
    tool_id = ind["toolid"]
    if tool_id is None:
        raise ValueError(name + ': Missing required parameter for initial: "toolid".')
    all_ids = list(tool_info.keys())
    if tool_id not in all_ids:
        raise ValueError(
            name
            + ": "
            + id
            + " is not a valid tool id. Possible tool ids are: "
            + str(all_ids)
            + "."
        )

    # NOTE: SketchResponse original names, not PL versions.
    n_point_tools = ["spline", "freeform", "polyline", "polygon"]

    tool = tool_info[id]["type"]
    if tool in n_point_tools:
        return validate_initial_n_points(ind, name, tool, ranges)
    else:
        return validate_initial_set_points(ind, name, tool)


def format_initials(all_initials, id, tool_dict, data, name):

    x_s = data["params"][name]["sketch_config"]["ranges"]["x_start"]
    x_e = data["params"][name]["sketch_config"]["ranges"]["x_end"]
    y_s = data["params"][name]["sketch_config"]["ranges"]["y_start"]
    y_e = data["params"][name]["sketch_config"]["ranges"]["y_end"]
    width = data["params"][name]["sketch_config"]["ranges"]["width"]
    height = data["params"][name]["sketch_config"]["ranges"]["height"]

    n_point_tools = ["spline", "freeform", "polyline", "polygon"]

    new_format = []
    if tool_dict[id]["type"] == "horizontal-line":
        for initial in all_initials:
            if initial["toolid"] == id:
                coordinates = initial["coordinates"]
                new_format = [
                    {"y": graph_to_screen_y(y_s, y_e, height, float(coord))}
                    for coord in coordinates
                ]
    elif tool_dict[id]["type"] == "vertical-line":
        for initial in all_initials:
            if initial["toolid"] == id:
                coordinates = initial["coordinates"]
                new_format = [
                    {"x": graph_to_screen_x(x_s, x_e, width, float(coord))}
                    for coord in coordinates
                ]
    elif tool_dict[id]["type"] in n_point_tools:
        for initial in all_initials:
            if initial["toolid"] == id:
                if "coordinates" in initial:
                    coordinates = initial["coordinates"]
                    x_y_vals = [
                        [
                            graph_to_screen_x(x_s, x_e, width, coordinates[i]),
                            graph_to_screen_y(y_s, y_e, height, coordinates[i + 1]),
                        ]
                        for i in range(0, len(coordinates), 2)
                    ]
                    if tool_dict[id]["type"] == "freeform":
                        x_y_vals = fitCurve(x_y_vals, 5)
                    formatted_x_y_vals = [
                        {"x": val[0], "y": val[1]} for val in x_y_vals
                    ]
                    if (
                        tool_dict[id]["type"] == "polygon"
                        and len(formatted_x_y_vals) > 30
                    ):
                        raise ValueError(
                            "The drawn region exceeds the allowed number of vertices (max 30)."
                        )
                    new_format.append(formatted_x_y_vals)
                else:
                    function = None
                    x_range = None
                    if "fun" in initial:
                        function = parse_function_string(initial["fun"])
                        if function is None:
                            raise ValueError(
                                "Error parsing initial function with id "
                                + initial["toolid"]
                                + ': "'
                                + initial["fun"]
                                + '".'
                            )
                    elif "funref" in initial:
                        function_str = data["params"][initial["funref"]]
                        if function_str is None:
                            raise ValueError(
                                "Error finding function with id "
                                + initial["toolid"]
                                + ': "'
                                + initial["funref"]
                                + '".'
                            )
                        function = eval(function_str)
                    x_range_str = initial["xrange"]
                    if x_range_str is None:
                        x_range = [x_s, x_e]
                    else:
                        x_range_list = x_range_str.split(",")
                        x_range = [float(x_range_list[0]), float(x_range_list[1])]
                    while True:  # handle function breaks
                        x_y_vals, broken, new_start = function_to_spline(
                            function,
                            x_range,
                            data["params"][name]["sketch_config"]["ranges"],
                        )
                        if len(x_y_vals) > 0:
                            if tool_dict[id]["type"] == "freeform":
                                x_y_vals = fitCurve(x_y_vals, 5)
                            formatted_x_y_vals = [
                                {"x": val[0], "y": val[1]} for val in x_y_vals
                            ]
                            new_format.append(formatted_x_y_vals)
                        if broken:
                            x_range[0] = new_start
                        else:
                            break
        # NOTE: this might not work if we want to add several different unconnected splines. This would likely lead to them being connected to each other.
        return new_format
    else:  # one and two point tools
        new_format = []
        for initial in all_initials:
            if initial["toolid"] == id:
                coordinates = initial["coordinates"]
                new_format += [
                    {
                        "x": graph_to_screen_x(x_s, x_e, width, coordinates[i]),
                        "y": graph_to_screen_y(y_s, y_e, height, coordinates[i + 1]),
                    }
                    for i in range(0, len(coordinates), 2)
                ]
    return new_format


# End Data formatting helper functions ####


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")

    width = data["params"][name]["sketch_config"]["ranges"]["width"]
    height = data["params"][name]["sketch_config"]["ranges"]["height"]

    enforce_bounds = pl.get_boolean_attrib(
        element, "enforce-bounds", ENFORCE_BOUNDS_DEFAULT
    )

    config = {
        "width": width,
        "height": height,
        "xrange": [
            data["params"][name]["sketch_config"]["ranges"]["x_start"],
            data["params"][name]["sketch_config"]["ranges"]["x_end"],
        ],
        "yrange": [
            data["params"][name]["sketch_config"]["ranges"]["y_start"],
            data["params"][name]["sketch_config"]["ranges"]["y_end"],
        ],
        "xscale": "linear",
        "yscale": "linear",
        "enforceBounds": enforce_bounds,
        "safetyBuffer": 10,
        "coordinates": "cartesian",
        "plugins": data["params"][name]["sketch_config"]["plugins"],
        "initialstate": data["params"][name]["sketch_config"]["initial_state"],
    }

    submission = data["submitted_answers"].get(
        name + "-sketchresponse-submission", None
    )
    if submission:
        try:
            submission_parsed = json.loads(base64.b64decode(submission).decode("utf-8"))
            config["initialstate"] = submission_parsed["data"]
        except Exception:
            data["format_errors"][name] = (
                "Invalid or corrupted submission data received from SketchResponse."
            )

    read_only = pl.get_boolean_attrib(element, "read-only", READ_ONLY_DEFAULT)

    scored = False
    score = None
    feedback = None
    if name in data["partial_scores"]:
        scored = True
        score = data["partial_scores"][name]["score"]
        if score is not None:
            score = round(float(score) * 100)
        feedback = data["partial_scores"][name].get("feedback", "")

    all_correct = score == 100
    all_incorrect = score == 0

    if data["panel"] == "question":
        if read_only:
            config["readonly"] = True
        html_params = {
            "id": name,
            "question": True,
            "config": base64.b64encode(json.dumps(config).encode("utf-8")).decode(
                "utf-8"
            ),
            "scored": scored,
            "score": score,
            "feedback": feedback,
            "all_correct": all_correct,
            "all_incorrect": all_incorrect,
            "format_error": data["format_errors"].get(name, None),
            "read_only": read_only,
        }
        with open("pl-sketch.mustache") as f:
            return chevron.render(f, html_params).strip()
    elif data["panel"] == "submission":
        # Using random ID as a hack; each SketchResponse instance needs a unique ID, and only the question panel ID
        # matters because it gets parsed by Python, so all other panels currently get assigned random IDs
        config["readonly"] = True
        html_params = {
            "id": "".join(random.choice(string.ascii_lowercase) for _ in range(15)),
            "submission": True,
            "config": base64.b64encode(json.dumps(config).encode("utf-8")).decode(
                "utf-8"
            ),
            "scored": scored,
            "score": score,
            "feedback": feedback,
            "all_correct": all_correct,
            "all_incorrect": all_incorrect,
            "format_error": data["format_errors"].get(name, None),
            "read_only": read_only,
        }
        with open("pl-sketch.mustache") as f:
            return chevron.render(f, html_params).strip()
    else:  # answer panel
        config["readonly"] = True
        html_params = {
            "id": "".join(random.choice(string.ascii_lowercase) for _ in range(15)),
            "answer": True,
            "config": base64.b64encode(json.dumps(config).encode("utf-8")).decode(
                "utf-8"
            ),
            "scored": scored,
            "score": score,
            "feedback": feedback,
        }
        with open("pl-sketch.mustache") as f:
            return chevron.render(f, html_params).strip()


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")

    # check if the question is marked as material (informational)
    read_only = pl.get_boolean_attrib(element, "read-only", False)
    # if it's material, skip grading
    if read_only:
        return

    submission = data["submitted_answers"].get(
        name + "-sketchresponse-submission", None
    )
    if submission:
        try:
            submission_parsed = json.loads(base64.b64decode(submission).decode("utf-8"))
        except Exception:
            data["format_errors"][name] = "Invalid or corrupted submission data."
            return
    else:
        data["format_errors"][name] = "No graph has been submitted."
        return

    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    empty = True
    if not allow_blank:
        gradeable = submission_parsed["gradeable"]
        for toolid in gradeable:
            if len(gradeable[toolid]) != 0:
                empty = False
                break
        if empty:
            data["format_errors"][name] = "Graph is blank."
            return

    # validate that polygons have <= 20 vertices
    # validate that spline-type objects with the same toolid don't overlap each other more than 15 px
    spline_based_tool_names = ["freeform", "spline", "polyline"]
    tool_info = data["params"][name]["sketch_config"]["tool_info"]

    # we don't want to check overlap if the graph is flipped for f(y) grading
    no_overlap_check = []
    for grader in data["params"][name]["sketch_config"]["graders"]:
        if "funxyswap" in grader and grader["funxyswap"] is True:
            no_overlap_check += [
                tool_info[tool.strip()]["type"] for tool in grader["toolid"].split(",")
            ]

    for toolid in submission_parsed["gradeable"]:
        tool_type = tool_info[toolid]["type"]
        if tool_type == "polygon":
            for spline in submission_parsed["gradeable"][toolid]:
                if (len(spline["spline"]) - 1) / 3 > 30:
                    data["format_errors"][name] = (
                        "The drawn region exceeds the allowed number of vertices (max 30)."
                    )
                    break
        elif tool_type in spline_based_tool_names and tool_type not in no_overlap_check:
            if len(submission_parsed["gradeable"][toolid]) == 1:
                continue
            # get min and max x values of each object drawn with spline-type tool, see if they overlap more than 15 px
            ranges = [
                [
                    min(spline["spline"], key=lambda x: x[0])[0],
                    max(spline["spline"], key=lambda x: x[0])[0],
                ]
                for spline in submission_parsed["gradeable"][toolid]
            ]
            ranges = sorted(ranges, key=lambda rg: rg[0])
            for i in range(len(ranges) - 1):
                total_overlap = 0
                if ranges[i + 1][0] < ranges[i][1]:
                    total_overlap += (
                        min(ranges[i][1], ranges[i + 1][1]) - ranges[i + 1][0]
                    )
                overlap_tolerance = 15
                if total_overlap > overlap_tolerance:
                    x_s = data["params"][name]["sketch_config"]["ranges"]["x_start"]
                    x_e = data["params"][name]["sketch_config"]["ranges"]["x_end"]
                    width = data["params"][name]["sketch_config"]["ranges"]["width"]
                    g_overlap = screen_to_graph_dist(x_e - x_s, width, total_overlap)
                    g_tolerance = screen_to_graph_dist(
                        x_e - x_s, width, overlap_tolerance
                    )
                    data["format_errors"][name] = (
                        'Two "'
                        + tool_info[toolid]["label"]
                        + (
                            f'" lines overlap by {round(g_overlap, 3)}, which is greater than the overlap tolerance of {round(g_tolerance, 3)}.'
                        )
                    )


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    # return if read-only
    read_only = pl.get_boolean_attrib(element, "read-only", READ_ONLY_DEFAULT)
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    if read_only:
        return

    graders = data["params"][name]["sketch_config"]["graders"]
    if len(graders) == 0:
        data["partial_scores"][name] = {"score": 1, "weight": 0, "feedback": None}
    graders = sorted(graders, key=lambda grader: grader["stage"])
    sorted_graders = {}
    for grader in graders:
        if grader["stage"] not in sorted_graders:
            sorted_graders[grader["stage"]] = [grader]
        else:
            sorted_graders[grader["stage"]].append(grader)
    tools = data["params"][name]["sketch_config"]["plugins"][:]
    tools.pop(0)

    debug = any(grader["debug"] for grader in graders)

    # get the score, weight, feedback for each grader
    scores = []
    weights = []
    feedbacks = set()
    debug_messages = []
    num_correct = 0
    prev_stage_correct = True
    for stage, graders in sorted_graders.items():
        if prev_stage_correct:
            for grader in graders:
                score, weight, feedback = grade_submission(grader, data, name)
                if score == 1:
                    scores.append(1)
                    weights.append(weight)
                    num_correct += 1
                else:
                    scores.append(0)
                    weights.append(weight)
                    if type(feedback) is str:
                        feedback = [feedback]
                    feedbacks.add(feedback[0])
                    if debug:
                        debug_messages += [feedback]
                    if stage != -1:
                        prev_stage_correct = False
        else:
            for grader in graders:
                score, weight, feedback = grade_submission(grader, data, name)
                scores.append(0)
                weights.append(weight)
                if type(feedback) is str:
                    feedback = [feedback]
                feedbacks.add(feedback[0])
                if debug:
                    debug_messages += [feedback]

    total_weights = sum(weights)
    if total_weights == 0:
        return
    percentage = 1 / total_weights
    score = round(
        sum(scores[i] * percentage * weights[i] for i in range(len(scores))), 2
    )
    feedback = []
    if len(feedbacks) == 0:
        feedback += [{"correct": True, "fb": "Correct!"}]
    elif not debug:
        feedback += [
            {"correct": False, "fb": feedback}
            for feedback in feedbacks
            if feedback != ""
        ]
    else:
        feedback += [
            {
                "correct": False,
                "fb": debug[0],
                "debug_mode": len(debug) > 1,
                "debug": [{"message": m} for m in debug[1:]],
            }
            for debug in debug_messages
            if debug[0] != ""
        ]
    data["partial_scores"][name] = {
        "score": score,
        "weight": weight,
        "feedback": feedback,
    }
