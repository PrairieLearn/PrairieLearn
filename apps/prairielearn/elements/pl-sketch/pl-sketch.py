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
    closed: (
        bool | None
    )  # Polygons are internally "closed polylines" - this flag is the only difference
    fillcolor: str | None
    arrowhead: int | None


class SketchGrader(TypedDict):
    type: str | None
    toolid: list[SketchTool] | None
    x: float | str | None
    y: float | None
    endpoint: str | None
    xrange: list[float] | None
    yrange: list[float] | None
    count: int | None
    fun: str | None
    xyflip: bool | None
    mode: str | None
    allowundefined: bool | None
    weight: int | None
    stage: int | None
    tolerance: int | None
    feedback: str | None
    debug: bool | None


class SketchCanvasSize(TypedDict):
    x_start: float
    x_end: float
    y_start: float
    y_end: float
    height: int
    width: int


class SketchInitial(TypedDict):
    toolid: str
    fun: str | None
    xrange: list[float]
    coordinates: list[float]


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["answers-name"]
    optional_attribs = [
        "weight",
        "xrange",
        "yrange",
        "width",
        "height",
        "enforce-bounds",
        "read-only",
        "allow-blank",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)

    name = pl.get_string_attrib(element, "answers-name")
    pl.check_answers_names(data, name)

    # xrange check
    x_range = split_range(
        pl.get_string_attrib(element, "xrange", XRANGE_DEFAULT), None, None
    )
    y_range = split_range(
        pl.get_string_attrib(element, "yrange", YRANGE_DEFAULT), None, None
    )

    read_only = pl.get_boolean_attrib(element, "read-only", READ_ONLY_DEFAULT)

    toolbar: list = []  # List of tools as it will be sent to the client
    tool_data = {}  # ID-based lookup table for tools that is used internally
    tool_groups = {}

    # First pass on nested tags to get tool definitions
    # We will do grading criteria and initials later since these tags reference the tool IDs
    for html_tag in element:
        if html_tag.tag == "pl-sketch-tool":
            tool = check_tool(html_tag)
            tool_data[tool["id"]] = tool

            # Some post-processing to sort tools into groups if desired
            group = tool["group"]
            if group is None:
                toolbar.append(tool)
            elif group not in tool_groups:
                tool_groups[group] = [tool]
                group_formatted = {
                    "name": "group",
                    "id": group,
                    "label": group,
                    "plugins": tool_groups[group],
                }
                toolbar.append(group_formatted)
            else:
                tool_groups[group].append(tool)

    # Add default tool if no tools have been specified
    if len(tool_data) == 0:
        fd = {"name": "freeform", "id": "fd", "label": "Function f(x)", "color": "blue"}
        tool_data["fd"] = {
            "type": "free-draw",
            "helper": False,
            "readonly": False,
            "label": "Function f(x)",
            "group": None,
        }
        toolbar.append(fd)

    # Add axes/grid for the canvas (technically a "tool" on the client side)
    # TODO: Some fancier math might be nice here to better support unusual range configurations
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
    toolbar.insert(0, axes_plugins)

    # Check maximum width of toolbar
    num_tools = len([
        tool_id
        for tool_id in tool_data
        if not tool_data[tool_id]["readonly"]
        and not tool_data[tool_id]["helper"]
        and not tool_data[tool_id]["group"]
    ])
    num_tools += len(tool_groups)
    if num_tools > 7:
        raise ValueError(
            "A maximum of 7 tool icons is supported in a sketching canvas toolbar. Consider using groups to reduce the number of toolbar icons."
        )

    min_width = 240 + 70 * num_tools
    if read_only:
        min_width = 240

    width = pl.get_integer_attrib(element, "width", None)
    if width is not None:
        if width > 900:
            raise ValueError(
                "The width of the sketching canvas must be less than or equal to 900 pixels to avoid display issues."
            )
        if width < min_width:
            raise ValueError(
                "width must be at least "
                + str(min_width)
                + " pixels to avoid display issues. Note that this value is based on the number of tool icons in the toolbar."
            )
    else:
        width = WIDTH_DEFAULT
    height = pl.get_integer_attrib(element, "height", HEIGHT_DEFAULT)

    # Set up the canvas configuration based on attributes.
    # Note that there's a 10-pixel margin added around the canvas for better usability when drawing close to the edges
    xscale = (x_range[1] - x_range[0]) / (width - 20)
    x_range[0] -= 10 * xscale
    x_range[1] += 10 * xscale

    yscale = (y_range[1] - y_range[0]) / (height - 20)
    y_range[0] -= 10 * yscale
    y_range[1] += 10 * yscale

    ranges_config: SketchCanvasSize = {
        "x_start": x_range[0],
        "x_end": x_range[1],
        "y_start": y_range[0],
        "y_end": y_range[1],
        "width": width,
        "height": height,
    }

    # Validate and set graders and initial values
    graders: list = []
    initials: list = []

    for html_tag in element:
        if html_tag.tag == "pl-sketch-grade":
            grader = check_grader(html_tag, tool_data, ranges_config)
            graders.append(grader)
        elif html_tag.tag == "pl-sketch-initial":
            # Here we check and set up initials in a clean data format
            initial = check_initial(html_tag, tool_data, ranges_config)
            initials.append(initial)

    # Here we convert the data format into the client side representation that is grouped by tool
    initial_ids = {initial["toolid"] for initial in initials}
    initial_state = {
        initial_id: format_initials(initials, tool_data[initial_id], ranges_config)
        for initial_id in initial_ids
    }

    # Saving all processed data into a dictionary
    data["params"][name] = {
        "sketch_config": {
            "plugins": toolbar,
            "tool_data": tool_data,
            "initial_state": initial_state,
            "ranges": ranges_config,
            "graders": graders,
        }
    }


def split_range(
    xrange: str, default_start: float | None, default_end: float | None
) -> list[float]:
    """
    Convert a range specified as a string with empty placeholders into a float list (e.g., "-5,5" -> [-5, 5],
      ",5" -> [default_start, 5], "0.1," -> [0.1, default_end]). This function is also used to validate
      the raw string inputs, so it is intentionally verbose. Ranges must be sorted. If default_start or
      default_end are None, both ends of the range are required.

    Returns:
        A list of exactly 2 floating point numbers that represent the start and end of the range.

    Raises:
        ValueError: If the range is ill-formatted or otherwise invalid
    """
    result = []
    for x in xrange.split(","):
        if x.strip() == "":
            result.append(None)
        else:
            result.append(float(x))
    if len(result) != 2:
        if not default_start:
            raise ValueError("Ranges must contain two values separated by a comma.")
        raise ValueError(
            "Ranges must contain two values (or empty placeholders) separated by a comma."
        )
    if result[0] is None:
        result[0] = default_start
    if result[1] is None:
        result[1] = default_end
    if result[0] is None or result[1] is None:
        raise ValueError("No empty range placeholders are allowed for canvas ranges.")
    if result[0] >= result[1]:
        raise ValueError(
            "Ranges must be ordered from low to high numbers and within the canvas bounds."
        )
    return result


def check_tool(tool_tag: lxml.html.HtmlElement) -> SketchTool:
    """
    Check that a sketching tool tag is valid (similar to PL element tag validation, but accounting for the
    many different attributes for each tool type).

    Returns:
        The sketching tool converted into a typed dictionary

    Raises:
        ValueError: If data in the tag is invalid
    """
    # Common list of optional tool attribs
    optional_attribs = [
        "label",
        "limit",
        "color",
        "helper",
        "read-only",
        "group",
    ]

    # check that required parameters are there for all
    tool_type = pl.get_string_attrib(tool_tag, "type")
    tool_id = pl.get_string_attrib(tool_tag, "id")
    defaults = {}
    defaults["readonly"] = False
    defaults["helper"] = False
    defaults["limit"] = 0
    defaults["group"] = None
    match tool_type:
        case "free-draw":
            defaults["type"] = "freeform"
            defaults["label"] = "Function f(x)"
            defaults["color"] = "blue"
        case "point":
            optional_attribs.extend([
                "size",
                "hollow",
            ])
            defaults["type"] = "point"
            defaults["label"] = "Point"
            defaults["color"] = "black"
            defaults["size"] = 15
            defaults["hollow"] = False
        case "spline":
            defaults["type"] = "spline"
            defaults["label"] = "Function f(x)"
            defaults["color"] = "purple"
        case "polyline":
            defaults["type"] = "polyline"
            defaults["label"] = "Function f(x)"
            defaults["color"] = "orange"
            defaults["closed"] = False
        case "polygon":
            optional_attribs.extend(["dash-style", "opacity", "fill-color"])
            defaults["type"] = "polyline"
            defaults["label"] = "Polygon"
            defaults["color"] = "mediumseagreen"
            defaults["fillcolor"] = "mediumseagreen"
            defaults["opacity"] = 0.5
            defaults["closed"] = True
        case "line":
            optional_attribs.extend([
                "dash-style",
                "direction-constraint",
                "length-constraint",
                "arrowhead",
            ])
            defaults["type"] = "line"
            defaults["label"] = "Line"
            defaults["color"] = "red"
            defaults["dashstyle"] = "solid"
            defaults["directionconstraint"] = None
            defaults["lengthconstraint"] = 0
            defaults["arrowhead"] = 0
        case "horizontal-line":
            optional_attribs.append("dash-style")
            defaults["type"] = "horizontalline"
            defaults["label"] = "Horizontal Line"
            defaults["color"] = "dimgray"
            defaults["dashstyle"] = "dashdotted"
        case "vertical-line":
            optional_attribs.append("dash-style")
            defaults["type"] = "verticalline"
            defaults["label"] = "Vertical Line"
            defaults["color"] = "dimgray"
            defaults["dashstyle"] = "dashdotted"
        case _:
            raise ValueError("Invalid tool type used: " + tool_type)

    pl.check_attribs(tool_tag, ["type", "id"], optional_attribs)

    tool_params: SketchTool = {
        "type": defaults["type"],
        "id": tool_id,
        "label": pl.get_string_attrib(tool_tag, "label", defaults["label"]),
        "color": pl.get_string_attrib(tool_tag, "color", defaults["color"]),
        "readonly": pl.get_boolean_attrib(tool_tag, "read-only", defaults["readonly"]),
        "helper": pl.get_boolean_attrib(tool_tag, "helper", defaults["helper"]),
        "limit": pl.get_integer_attrib(tool_tag, "limit", defaults["limit"]),
        "group": pl.get_string_attrib(tool_tag, "group", defaults["group"]),
        "dashstyle": pl.get_string_attrib(
            tool_tag, "dash-style", defaults.get("dashstyle")
        ),
        "directionconstraint": pl.get_string_attrib(
            tool_tag, "direction-constraint", defaults.get("directionconstraint")
        ),
        "lengthconstraint": pl.get_float_attrib(
            tool_tag, "length-constraint", defaults.get("lengthconstraint")
        ),
        "size": pl.get_integer_attrib(tool_tag, "size", defaults.get("size")),
        "hollow": pl.get_boolean_attrib(tool_tag, "hollow", defaults.get("hollow")),
        "opacity": pl.get_float_attrib(tool_tag, "opacity", defaults.get("opacity")),
        "fillcolor": pl.get_string_attrib(
            tool_tag, "fillcolor", defaults.get("fillcolor")
        ),
        "arrowhead": pl.get_integer_attrib(
            tool_tag, "arrowhead", defaults.get("arrowhead")
        ),
        "closed": defaults.get("closed"),
    }

    if tool_params["readonly"] and tool_params["helper"]:
        raise ValueError('A tool cannot be set to be both a "helper" and "read-only".')
    if tool_params["limit"] and tool_params["limit"] < 1:
        raise ValueError("A tool cannot have a limit of less than 1.")
    if tool_params["dashstyle"] and tool_params["dashstyle"] not in {
        "solid",
        "dashed",
        "longdashed",
        "dotted",
        "dashdotted",
    }:
        raise ValueError(
            f'A tool cannot have a dash-style "{tool_params["dashstyle"]}"'
        )
    if tool_params["directionconstraint"] and tool_params[
        "directionconstraint"
    ] not in {
        "horizontal",
        "vertical",
        "none",
    }:
        raise ValueError(
            f'A tool cannot have a directional constraint "{tool_params["directionconstraint"]}"'
        )
    if tool_params["opacity"] and (
        tool_params["opacity"] < 0 or tool_params["opacity"] > 1
    ):
        raise ValueError("A tool cannot have an opacity outside the range [0,1].")
    if tool_params["lengthconstraint"] and tool_params["lengthconstraint"] < 0:
        raise ValueError("A tool cannot have a negative length constraint.")
    if tool_params["arrowhead"] and tool_params["arrowhead"] < 0:
        raise ValueError("A tool cannot have a negative arrowhead size.")
    return tool_params


def check_grader(
    grader_tag: lxml.html.HtmlElement,
    tool_data: dict[str, SketchTool],
    ranges: SketchCanvasSize,
) -> SketchGrader:
    """
    Check that a sketch grading criterion tag is valid (similar to PL element tag validation, but accounting for
    the many different attributes for each grading criterion).

    Returns:
        The grading criterion converted into a typed dictionary

    Raises:
        ValueError: If data in the tag is invalid
    """
    # Common list of optional grader attribs
    optional_attribs = [
        "toolid",
        "tolerance",
        "weight",
        "stage",
        "feedback",
        "debug",
    ]
    grader_type = pl.get_string_attrib(grader_tag, "type")
    grader_tools = pl.get_string_attrib(grader_tag, "toolid")
    tools: list[SketchTool] = []
    for tool in grader_tools.split(","):
        if tool in tool_data:
            tools.append(tool_data[tool])
        else:
            raise ValueError(f"Invalid tool id: {tool}")
    if len(tools) == 0:
        raise ValueError(
            "Each grading criterion must have at least one tool id associated with it."
        )

    defaults = {}
    defaults["weight"] = 1
    defaults["stage"] = 0
    defaults["debug"] = False

    match grader_type:
        case "count":
            optional_attribs.extend([
                "mode",
                "xrange",
                "count",
            ])
            mode_attrib = pl.get_string_attrib(grader_tag, "mode", None)
            count_attrib = pl.get_integer_attrib(grader_tag, "count", None)
            if count_attrib is None:
                raise ValueError(
                    'The "count" attribute is required to use the "count" grading criterion.'
                )
            if mode_attrib is not None and mode_attrib not in [
                "exact",
                "at-least",
                "at-most",
            ]:
                raise ValueError(
                    'The "mode" attribute of the "count" grading criterion must be "exact", "at-least", or "at-most".'
                )
            defaults["tolerance"] = 0
        case (
            "defined-in"
            | "undefined-in"
            | "monot-increasing"
            | "monot-decreasing"
            | "concave-up"
            | "concave-down"
        ):
            optional_attribs.append("xrange")
            for tool in tools:
                if tool["type"] == "horizontal-line":
                    raise ValueError(
                        f'The "{grader_type}" grading criterion does not support the horizontal line tool.'
                    )
                if tool["type"] == "point" and grader_type != "undefined-in":
                    raise ValueError(
                        f'The "{grader_type}" grading criterion does not support the point or horizontal line tools.'
                    )
                if grader_type not in {"defined-in", "undefined-in"} and (
                    (tool["type"] == "polyline" and tool["closed"])
                    or tool["type"] == "vertical-line"
                ):
                    raise ValueError(
                        f'The "{grader_type}" grading criterion does not support the point, polygon, or horizontal/vertical line tools.'
                    )

            if grader_type.startswith("concave"):
                defaults["tolerance"] = 10
            elif grader_type.startswith("monot"):
                defaults["tolerance"] = 5
            else:
                defaults["tolerance"] = 20
        case "match":
            optional_attribs.extend([
                "x",
                "y",
                "endpoint",
            ])
            x_attrib = pl.get_float_attrib(grader_tag, "x", None)
            y_attrib = pl.get_float_attrib(grader_tag, "y", None)
            endpoint_attrib = pl.get_string_attrib(grader_tag, "endpoint", None)
            defaults["tolerance"] = 15

            for tool in tools:
                if tool["type"] == "horizontal-line" and y_attrib is None:
                    raise ValueError(
                        'The "y" attribute is required to use the "match" grading criterion for horizontal lines.'
                    )
                if tool["type"] == "vertical-line" and x_attrib is None:
                    raise ValueError(
                        'The "x" attribute is required to use the "match" grading criterion for vertical lines.'
                    )
                if x_attrib is None and y_attrib is None:
                    raise ValueError(
                        'Either the "x" or the "y" attribute is required to use the "match" grading criterion.'
                    )
                if endpoint_attrib is not None:
                    if tool["type"] != "line":
                        raise ValueError(
                            'The "endpoint" attribute of the "match" grading criterion can only be used for lines.'
                        )
                    if endpoint_attrib not in ["start", "end", "either"]:
                        raise ValueError(
                            'The "endpoint" attribute of the "match" grading criterion must be "start", "end", or "either".'
                        )
        case "match-fun":
            optional_attribs.extend([
                "fun",
                "xyflip",
                "allow-undefined",
                "xrange",
                "yrange",
            ])
            if pl.get_boolean_attrib(grader_tag, "xyflip", False):
                split_range(
                    pl.get_string_attrib(grader_tag, "yrange", ","),
                    ranges["y_start"],
                    ranges["y_end"],
                )
            else:
                split_range(
                    pl.get_string_attrib(grader_tag, "xrange", ","),
                    ranges["x_start"],
                    ranges["x_end"],
                )
            parse_function_string(pl.get_string_attrib(grader_tag, "fun"))
            for tool in tools:
                if (
                    tool["type"] == "line"
                    or tool["type"] == "horizontal-line"
                    or tool["type"] == "vertical-line"
                    or (tool["type"] == "polyline" and tool["closed"])
                ):
                    raise ValueError(
                        'The "match-fun" grading criterion does not support the line, polygon, or horizontal/vertical line tools.'
                    )
            pl.get_boolean_attrib(grader_tag, "allow-undefined", False)
            defaults["tolerance"] = 15
        case "less-than" | "greater-than":
            optional_attribs.extend([
                "y",
                "fun",
                "xyflip",
                "allow-undefined",
                "xrange",
                "yrange",
            ])
            y_attrib = pl.get_float_attrib(grader_tag, "y", None)
            fun_attrib = pl.get_string_attrib(grader_tag, "fun", None)
            if (y_attrib is None and fun_attrib is None) or (
                y_attrib is not None and fun_attrib is not None
            ):
                raise ValueError(
                    f'For the "{grader_type}" grading criterion, exactly one of the attributes "y" and "fun" must be set.'
                )
            if fun_attrib is not None:
                parse_function_string(fun_attrib)
            for tool in tools:
                if tool["type"] == "vertical-line":
                    raise ValueError(
                        f'The "{grader_type}" grading criterion does not support the vertical line tool.'
                    )
            pl.get_boolean_attrib(grader_tag, "allow-undefined", False)
            defaults["tolerance"] = 15
        case _:
            raise ValueError("Invalid grader type used: " + grader_type)

    pl.check_attribs(grader_tag, ["type", "toolid"], optional_attribs)

    tool_params: SketchGrader = {
        "type": grader_type,
        "toolid": tools,
        "weight": pl.get_integer_attrib(grader_tag, "weight", defaults["weight"]),
        "stage": pl.get_integer_attrib(grader_tag, "stage", defaults["stage"]),
        "tolerance": pl.get_boolean_attrib(
            grader_tag, "xyflip", defaults.get("tolerance", 15)
        ),
        "debug": pl.get_boolean_attrib(grader_tag, "xyflip", defaults["debug"]),
        "feedback": pl.get_string_attrib(grader_tag, "feedback", None),
        "x": pl.get_float_attrib(grader_tag, "x", None),
        "y": pl.get_float_attrib(grader_tag, "y", None),
        "xrange": split_range(
            pl.get_string_attrib(grader_tag, "xrange", ","),
            ranges["x_start"],
            ranges["x_end"],
        ),
        "yrange": split_range(
            pl.get_string_attrib(grader_tag, "yrange", ","),
            ranges["y_start"],
            ranges["y_end"],
        ),
        "endpoint": pl.get_string_attrib(grader_tag, "endpoint", None),
        "count": pl.get_integer_attrib(grader_tag, "count", None),
        "fun": pl.get_string_attrib(grader_tag, "fun", None),
        "xyflip": pl.get_boolean_attrib(grader_tag, "xyflip", None),
        "mode": pl.get_string_attrib(grader_tag, "mode", None),
        "allowundefined": pl.get_boolean_attrib(grader_tag, "allow-undefined", None),
    }

    return tool_params


def check_initial(
    initial_tag: lxml.html.HtmlElement,
    tool_data: dict[str, SketchTool],
    ranges: SketchCanvasSize,
) -> SketchInitial:
    """
    Checks that a sketch initial drawing tag is valid (similar to PL element tag validation, but accounting for
    the many different attributes for each tool that is referenced by the tag).

    Returns:
        The initial drawing data converted into a typed dictionary

    Raises:
        ValueError: If data in the tag is invalid
    """
    # check that toolid parameter there for all
    initial_tool = pl.get_string_attrib(initial_tag, "toolid")
    initial_coords = pl.get_string_attrib(initial_tag, "coordinates", None)
    initial_fun = pl.get_string_attrib(initial_tag, "fun", None)
    initial_xrange = split_range(
        pl.get_string_attrib(initial_tag, "xrange", ","),
        ranges["x_start"],
        ranges["x_end"],
    )

    if initial_tool not in tool_data:
        raise ValueError(
            f'Initial drawing tool "{initial_tool}" is not a valid tool ID.'
        )

    if (initial_coords is None and initial_fun is None) or (
        initial_coords is not None and initial_fun is not None
    ):
        raise ValueError(
            "Each initial drawing element needs either a coordinates or a fun attribute."
        )

    coords = []
    if initial_coords is not None:
        coords.extend(
            float(coord.replace("(", "").replace(")", "").strip())
            for coord in initial_coords.split(",")
        )

    match tool_data[initial_tool]["type"]:
        case "horizontal-line" | "vertical-line":
            if len(coords) != 1:
                raise ValueError(
                    "Initial drawings for horizontal/vertical tools need exactly one coordinate."
                )
        case "point":
            if len(coords) != 2:
                raise ValueError(
                    "Initial drawings for points need exactly two coordinates."
                )
        case "line":
            if len(coords) != 4:
                raise ValueError(
                    "Initial drawings for lines need exactly four coordinates (x/y pairs for start and end)."
                )
        case "polyline":
            if len(coords) < 4 or len(coords) % 2 != 0:
                raise ValueError(
                    "Initial drawings for lines with multiple segments need an even number and at least four coordinates (x/y pairs for start and end)."
                )
        case "spline" | "free-draw":
            if initial_fun is not None:
                parse_function_string(initial_fun)
            elif len(coords) < 4 or len(coords) % 2 != 0:
                raise ValueError(
                    "Initial drawings for lines with multiple segments need an even number and at least four coordinates (x/y pairs for start and end)."
                )
        case _:
            raise ValueError(f'Unknown tool type "{tool_data[initial_tool]["type"]}"')

    initial: SketchInitial = {
        "toolid": initial_tool,
        "coordinates": coords,
        "fun": initial_fun,
        "xrange": initial_xrange,
    }
    return initial


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
    if tool["type"] in ["horizontal-line", "vertical-line"]:
        for initial in initials:
            if initial["toolid"] == tool["id"]:
                coordinates = initial["coordinates"]
                if tool["type"] == "horizontal-line":
                    new_format = [
                        {
                            "x": graph_to_screen_x(
                                ranges["x_start"],
                                ranges["x_end"],
                                ranges["width"],
                                float(coord),
                            )
                        }
                        for coord in coordinates
                    ]
                else:
                    new_format = [
                        {
                            "y": graph_to_screen_y(
                                ranges["y_start"],
                                ranges["y_end"],
                                ranges["height"],
                                float(coord),
                            )
                        }
                        for coord in coordinates
                    ]
    elif tool["type"] in ["spline", "freeform", "polyline"]:
        for initial in initials:
            if initial["toolid"] == tool["id"]:
                if initial["fun"] is None:
                    coordinates = initial["coordinates"]
                    x_y_vals = [
                        [
                            graph_to_screen_x(
                                ranges["x_start"],
                                ranges["x_end"],
                                ranges["width"],
                                coordinates[i],
                            ),
                            graph_to_screen_y(
                                ranges["y_start"],
                                ranges["y_end"],
                                ranges["height"],
                                coordinates[i + 1],
                            ),
                        ]
                        for i in range(0, len(coordinates), 2)
                    ]
                    # Free-draw needs special handling since it is stored in a different data format on the client side
                    if tool["type"] == "free-draw":
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
                            if tool["type"] == "free-draw":
                                x_y_vals = fitCurve(x_y_vals, 5)
                            formatted_x_y_vals = [
                                {"x": val[0], "y": val[1]} for val in x_y_vals
                            ]
                            new_format.append(formatted_x_y_vals)
                        if broken:
                            x1 = new_start
        return new_format
    else:  # one and two point tools
        new_format = []
        for initial in initials:
            if initial["toolid"] == tool["id"]:
                coordinates = initial["coordinates"]
                new_format += [
                    {
                        "x": graph_to_screen_x(
                            ranges["x_start"],
                            ranges["x_end"],
                            ranges["width"],
                            coordinates[i],
                        ),
                        "y": graph_to_screen_y(
                            ranges["y_start"],
                            ranges["y_end"],
                            ranges["height"],
                            coordinates[i + 1],
                        ),
                    }
                    for i in range(0, len(coordinates), 2)
                ]
    return new_format


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")

    ranges = data["params"][name]["sketch_config"]["ranges"]
    toolbar = data["params"][name]["sketch_config"]["plugins"]
    initial = data["params"][name]["sketch_config"]["initial_state"]

    enforce_bounds = pl.get_boolean_attrib(
        element, "enforce-bounds", ENFORCE_BOUNDS_DEFAULT
    )

    config = {
        "width": ranges["width"],
        "height": ranges["height"],
        "xrange": [
            ranges["x_start"],
            ranges["x_end"],
        ],
        "yrange": [
            ranges["y_start"],
            ranges["y_end"],
        ],
        "xscale": "linear",
        "yscale": "linear",
        "enforceBounds": enforce_bounds,
        "safetyBuffer": 10,
        "coordinates": "cartesian",
        "plugins": toolbar,
        "initialstate": initial,
    }

    submission = data["submitted_answers"].get(
        name + "-sketchresponse-submission", None
    )
    if submission:
        try:
            submission_parsed = json.loads(base64.b64decode(submission).decode("utf-8"))
            # If the submission is valid, it will replace the initial state of the canvas
            # Note that the initialstate input and the submission output of the client have
            # the same format, so piping one into the other is very convenient.
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

    # For formatting the badges
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
        # Using a random ID here as each SketchResponse instance needs a unique ID, and only the question panel ID
        # matters because it gets parsed on submission. All other panel IDs don't matter as long as they are unique.
        config["readonly"] = True
        random_id = "".join(random.choice(string.ascii_lowercase) for _ in range(15))
        html_params = {
            "id": random_id,
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
        random_id = "".join(random.choice(string.ascii_lowercase) for _ in range(15))
        html_params = {
            "id": random_id,
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

    # check if the question is marked as read-only
    read_only = pl.get_boolean_attrib(element, "read-only", False)
    # if it's read-only, skip grading
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

    # The actual submission data is in this field
    gradeable = submission_parsed["gradeable"]

    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    empty = True

    if not allow_blank:
        for toolid in gradeable:
            if len(gradeable[toolid]) != 0:
                empty = False
                break
        if empty:
            data["format_errors"][name] = "Graph is blank."
            return

    # validate that polygons have <= 20 vertices
    # validate that spline-type objects with the same toolid don't overlap each other more than 15 px
    # TODO: Consider moving the second check into the grader since it might be useful to make it configurable for
    # each grading criterion. Arguably, drawing a non-function when a function is requested is an incorrect answer
    # and does not need to be flagged as invalid.
    spline_based_tool_names = ["free-draw", "spline", "polyline"]
    tool_info = data["params"][name]["sketch_config"]["tool_info"]

    # we don't want to check overlap if the graph is flipped for f(y) grading
    no_overlap_check = []
    for grader in data["params"][name]["sketch_config"]["graders"]:
        if "xyflip" in grader and grader["xyflip"] is True:
            no_overlap_check += [
                tool_info[tool.strip()]["type"] for tool in grader["toolid"].split(",")
            ]

    for toolid in gradeable:
        tool_type = tool_info[toolid]["type"]
        if tool_type == "polygon":
            for spline in gradeable[toolid]:
                if (len(spline["spline"]) - 1) / 3 > 30:
                    data["format_errors"][name] = (
                        "A drawn polygon/region exceeds the allowed number of vertices (max 30)."
                    )
                    break
        elif tool_type in spline_based_tool_names and tool_type not in no_overlap_check:
            if len(gradeable[toolid]) == 1:
                continue
            # get min and max x values of each object and see if they overlap more than 5 px
            ranges = [
                [
                    min(spline["spline"], key=lambda x: x[0])[0],
                    max(spline["spline"], key=lambda x: x[0])[0],
                ]
                for spline in gradeable[toolid]
            ]
            ranges = sorted(ranges, key=lambda rg: rg[0])
            for i in range(len(ranges) - 1):
                total_overlap = 0
                if ranges[i + 1][0] < ranges[i][1]:
                    total_overlap += (
                        min(ranges[i][1], ranges[i + 1][1]) - ranges[i + 1][0]
                    )
                overlap_tolerance = 5
                if total_overlap > overlap_tolerance:
                    data["format_errors"][name] = (
                        'Multiple "'
                        + tool_info[toolid]["label"]
                        + (
                            '" lines are defined in the same range. These lines are interpreted as functions, and only one y-value can exist for any x-coordinate.'
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
        for grader in graders:
            # We grade all criteria (even if a previous stage failed)
            score, weight, feedback = grade_submission(grader, data, name)
            weights.append(weight)
            if score == 1:
                # Correct answers are only worth points if the previous stage has passed
                if prev_stage_correct:
                    scores.append(1)
                    num_correct += 1
                else:
                    scores.append(0)
            else:
                # Incorrect answers block later stages and also trigger feedback
                scores.append(0)
                if type(feedback) is str:
                    feedback = [feedback]
                feedbacks.add(feedback[0])
                if debug:
                    debug_messages += [feedback]
                if stage != -1:
                    prev_stage_correct = False

    total_weights = sum(weights)
    if total_weights == 0:
        return
    percentage = 1 / total_weights
    score = round(
        sum(scores[i] * percentage * weights[i] for i in range(len(scores))), 2
    )

    # Print feedback and potentially debug output (if the attribute is set)
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
