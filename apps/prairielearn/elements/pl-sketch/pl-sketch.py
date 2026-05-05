import base64
import copy
import json
import random
import re
import string
from typing import Any, Literal, NotRequired, TypedDict, cast

import chevron
import lxml.html
import prairielearn as pl
from pl_sketch_grading import grade_submission
from prairielearn.question_utils import PartialScore
from sketchresponse.types import (
    SketchCanvasSize,
    SketchDrawing,
    SketchGradeableData,
    SketchGrader,
    SketchTool,
)
from sketchresponse.utils import format_drawing, parse_function_string


class _AxesLabel(TypedDict):
    value: str
    dx: int
    dy: int


class _AxesLabelColors(TypedDict):
    xaxisLabel: str
    yaxisLabel: str


class _AxesLabelFontSize(TypedDict):
    xaxisLabel: int
    yaxisLabel: int


class AxesPlugin(TypedDict):
    name: Literal["axes"]
    xaxisLabel: _AxesLabel
    yaxisLabel: _AxesLabel
    colors: _AxesLabelColors
    fontSize: _AxesLabelFontSize


class SketchGroup(TypedDict):
    name: Literal["group"]
    id: str
    label: str
    plugins: list[SketchTool]


class OverlayTool(SketchTool):
    overlay: bool


ToolbarPlugin = SketchTool | AxesPlugin | SketchGroup | OverlayTool

# lines are list[dict[str, float]], spline/freeform/polyline are list[list[dict[str, float]]]
DrawingData = list[Any]


class SketchClientConfig(TypedDict):
    width: int
    height: int
    xrange: list[float]
    yrange: list[float]
    xscale: str
    yscale: str
    enforceBounds: bool
    safetyBuffer: int
    coordinates: str
    plugins: list[ToolbarPlugin]
    initialstate: dict[str, DrawingData]
    readonly: NotRequired[bool]


class SketchAnswerParams(TypedDict):
    plugins: list[ToolbarPlugin]
    tool_data: dict[str, SketchTool]
    initial_state: dict[str, DrawingData]
    solution_state: dict[str, DrawingData]
    ranges: SketchCanvasSize
    graders: list[SketchGrader]
    config: SketchClientConfig


WEIGHT_DEFAULT = 1
XRANGE_DEFAULT = "-5,5"
YRANGE_DEFAULT = "-5,5"
WIDTH_DEFAULT = 800
HEIGHT_DEFAULT = 450
ENFORCE_BOUNDS_DEFAULT = False
READ_ONLY_DEFAULT = False
OVERLAY_SOLUTION_DEFAULT = True
ALLOW_BLANK_DEFAULT = False


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["answers-name"]
    optional_attribs = [
        "weight",
        "x-range",
        "y-range",
        "width",
        "height",
        "enforce-bounds",
        "read-only",
        "overlay-solution",
        "allow-blank",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)

    name = pl.get_string_attrib(element, "answers-name")
    pl.check_answers_names(data, name)

    read_only = pl.get_boolean_attrib(element, "read-only", READ_ONLY_DEFAULT)

    # Just validate this is actually boolean - we don't need the value here
    pl.get_boolean_attrib(element, "overlay-solution", OVERLAY_SOLUTION_DEFAULT)

    toolbar: list[ToolbarPlugin] = []  # List of tools as it will be sent to the client
    tool_data: dict[
        str, SketchTool
    ] = {}  # ID-based lookup table for tools that is used internally
    tool_groups: dict[str, list[SketchTool]] = {}

    # First pass on nested tags to get tool definitions
    # We will do grading criteria and initials later since these tags reference the tool IDs
    for html_tag in element:
        if html_tag.tag == "pl-sketch-tool":
            tool = _check_tool(html_tag)
            tool_data[tool["id"]] = tool

            # Some post-processing to sort tools into groups if desired
            group = tool["group"]
            if group is None:
                toolbar.append(tool)
            elif group not in tool_groups:
                tool_groups[group] = [tool]
                group_formatted: SketchGroup = {
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
        fd: SketchTool = {
            "name": "freeform",
            "id": "fd",
            "label": "Function f(x)",
            "color": "blue",
            "readonly": False,
            "helper": False,
            "limit": None,
            "group": None,
            "dashStyle": None,
            "directionConstraint": None,
            "lengthConstraint": None,
            "size": None,
            "hollow": None,
            "opacity": None,
            "closed": None,
            "fillColor": None,
            "arrowHead": None,
        }
        tool_data["fd"] = fd
        toolbar.append(fd)

    # Add axes/grid for the canvas (technically a "tool" on the client side)
    axes_plugins: AxesPlugin = {
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

    width = pl.get_integer_attrib(element, "width", WIDTH_DEFAULT)
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
    height = pl.get_integer_attrib(element, "height", HEIGHT_DEFAULT)

    x_range = _split_range(
        pl.get_string_attrib(element, "x-range", XRANGE_DEFAULT), None, None
    )
    y_range = _split_range(
        pl.get_string_attrib(element, "y-range", YRANGE_DEFAULT), None, None
    )

    ranges_config = _prepare_ranges(x_range, y_range, width, height)

    enforce_bounds = pl.get_boolean_attrib(
        element, "enforce-bounds", ENFORCE_BOUNDS_DEFAULT
    )

    # Validate and set graders, initial and solution values
    graders: list[SketchGrader] = []
    initials: list[SketchDrawing] = []
    solutions: list[SketchDrawing] = []

    for html_tag in element:
        if html_tag.tag == "pl-sketch-grade":
            grader = _check_grader(html_tag, tool_data, ranges_config)
            graders.append(grader)
        elif html_tag.tag == "pl-sketch-initial":
            initial = _check_drawing(html_tag, tool_data, ranges_config)
            initials.append(initial)
        elif html_tag.tag == "pl-sketch-solution":
            solution = _check_drawing(html_tag, tool_data, ranges_config)
            solutions.append(solution)

    # Here we convert the data format into the client side representation that is grouped by tool
    initial_ids = {initial["toolid"] for initial in initials}
    initial_state: dict[str, DrawingData] = {
        initial_id: format_drawing(initials, tool_data[initial_id], ranges_config)
        for initial_id in initial_ids
    }

    # Repeating the same process for solution data, which effectively becomes the initial state of the answer panel
    solution_ids = {solution["toolid"] for solution in solutions}
    solution_state: dict[str, DrawingData] = {
        solution_id: format_drawing(solutions, tool_data[solution_id], ranges_config)
        for solution_id in solution_ids
    }

    client_config: SketchClientConfig = {
        "width": ranges_config["width"],
        "height": ranges_config["height"],
        "xrange": [
            ranges_config["x_start"],
            ranges_config["x_end"],
        ],
        "yrange": [
            ranges_config["y_start"],
            ranges_config["y_end"],
        ],
        "xscale": "linear",
        "yscale": "linear",
        "enforceBounds": enforce_bounds,
        "safetyBuffer": 10,
        "coordinates": "cartesian",
        "plugins": toolbar,
        "initialstate": initial_state,
    }

    # Saving all processed data into a dictionary
    params: SketchAnswerParams = {
        "plugins": toolbar,
        "tool_data": tool_data,
        "initial_state": initial_state,
        "solution_state": solution_state,
        "ranges": ranges_config,
        "graders": graders,
        "config": client_config,
    }
    data["params"][name] = params


def _split_range(
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
        if default_start is None:
            raise ValueError(
                f"Invalid range: {xrange}. Ranges must contain two values separated by a comma."
            )
        raise ValueError(
            f"Invalid range: {xrange}. Ranges must contain two values (or empty placeholders) separated by a comma."
        )
    if result[0] is None:
        result[0] = default_start
    if result[1] is None:
        result[1] = default_end
    if result[0] is None or result[1] is None:
        raise ValueError(
            f"Invalid range: {xrange}. No empty range placeholders are allowed for canvas ranges."
        )
    if result[0] >= result[1]:
        raise ValueError(
            f"Invalid range: {xrange}. Ranges must be ordered from low to high numbers and within the canvas bounds."
        )
    return result


def _prepare_ranges(
    x_range: list[float], y_range: list[float], width: int, height: int
) -> SketchCanvasSize:
    """Set up a dictionary with the canvas ranges and dimensions.

    Returns:
        A SketchCanvasSize dictionary based on the provided parameters
    """
    # Add 10 pixel margin around the canvas for better usability when drawing close to the edges
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
    return ranges_config


def _check_tool(tool_tag: lxml.html.HtmlElement) -> SketchTool:
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
    tool_type = pl.get_string_attrib(tool_tag, "type").strip()
    tool_id = pl.get_string_attrib(tool_tag, "id").strip()
    defaults = {}
    defaults["readonly"] = False
    defaults["helper"] = False
    defaults["limit"] = None
    defaults["group"] = None
    match tool_type:
        case "free-draw":
            defaults["name"] = "freeform"
            defaults["label"] = "Function f(x)"
            defaults["color"] = "blue"
        case "point":
            optional_attribs.extend([
                "size",
                "hollow",
            ])
            defaults["name"] = "point"
            defaults["label"] = "Point"
            defaults["color"] = "black"
            defaults["size"] = 15
            defaults["hollow"] = False
        case "spline":
            defaults["name"] = "spline"
            defaults["label"] = "Function f(x)"
            defaults["color"] = "purple"
        case "polyline":
            optional_attribs.extend(["dash-style"])
            defaults["name"] = "polyline"
            defaults["label"] = "Function f(x)"
            defaults["color"] = "orange"
            defaults["fillColor"] = "none"
            defaults["opacity"] = 1
            defaults["closed"] = False
        case "polygon":
            optional_attribs.extend(["dash-style", "opacity", "fill-color"])
            defaults["name"] = "polyline"
            defaults["label"] = "Polygon"
            defaults["color"] = "mediumseagreen"
            defaults["fillColor"] = "mediumseagreen"
            defaults["opacity"] = 0.5
            defaults["closed"] = True
        case "line":
            optional_attribs.extend([
                "dash-style",
                "direction-constraint",
                "length-constraint",
                "arrowhead",
            ])
            defaults["name"] = "line-segment"
            defaults["label"] = "Line"
            defaults["color"] = "red"
            defaults["dashStyle"] = "solid"
            defaults["directionConstraint"] = None
            defaults["lengthConstraint"] = 0
            defaults["arrowHead"] = 0
        case "horizontal-line":
            optional_attribs.append("dash-style")
            defaults["name"] = "horizontal-line"
            defaults["label"] = "Horizontal Line"
            defaults["color"] = "dimgray"
            defaults["dashStyle"] = "dashdotted"
        case "vertical-line":
            optional_attribs.append("dash-style")
            defaults["name"] = "vertical-line"
            defaults["label"] = "Vertical Line"
            defaults["color"] = "dimgray"
            defaults["dashStyle"] = "dashdotted"
        case _:
            raise ValueError("Invalid tool type used: " + tool_type)

    pl.check_attribs(tool_tag, ["type", "id"], optional_attribs)

    tool_params: SketchTool = {
        "name": defaults["name"],
        "id": tool_id,
        "label": pl.get_string_attrib(tool_tag, "label", defaults["label"]),
        "color": pl.get_string_attrib(tool_tag, "color", defaults["color"]),
        "readonly": pl.get_boolean_attrib(tool_tag, "read-only", defaults["readonly"]),
        "helper": pl.get_boolean_attrib(tool_tag, "helper", defaults["helper"]),
        "limit": pl.get_integer_attrib(tool_tag, "limit", defaults["limit"]),
        "group": pl.get_string_attrib(tool_tag, "group", defaults["group"]),
        "dashStyle": pl.get_string_attrib(
            tool_tag, "dash-style", defaults.get("dashStyle")
        ),
        "directionConstraint": pl.get_string_attrib(
            tool_tag, "direction-constraint", defaults.get("directionConstraint")
        ),
        "lengthConstraint": pl.get_float_attrib(
            tool_tag, "length-constraint", defaults.get("lengthConstraint")
        ),
        "size": pl.get_integer_attrib(tool_tag, "size", defaults.get("size")),
        "hollow": pl.get_boolean_attrib(tool_tag, "hollow", defaults.get("hollow")),
        "opacity": pl.get_float_attrib(tool_tag, "opacity", defaults.get("opacity")),
        "fillColor": pl.get_string_attrib(
            tool_tag, "fill-color", defaults.get("fillColor")
        ),
        "arrowHead": pl.get_integer_attrib(
            tool_tag, "arrowhead", defaults.get("arrowHead")
        ),
        "closed": defaults.get("closed"),
    }

    if tool_params["readonly"] and tool_params["helper"]:
        raise ValueError('A tool cannot be set to be both a "helper" and "read-only".')
    if tool_params["limit"] is not None and tool_params["limit"] < 1:
        raise ValueError("A tool cannot have a limit of less than 1.")
    if tool_params["dashStyle"] and tool_params["dashStyle"] not in {
        "solid",
        "dashed",
        "longdashed",
        "dotted",
        "dashdotted",
    }:
        raise ValueError(
            f'A tool cannot have a dash-style "{tool_params["dashStyle"]}"'
        )
    if tool_params["directionConstraint"] and tool_params[
        "directionConstraint"
    ] not in {
        "horizontal",
        "vertical",
        "none",
    }:
        raise ValueError(
            f'A tool cannot have a directional constraint "{tool_params["directionConstraint"]}"'
        )
    if tool_params["opacity"] and (
        tool_params["opacity"] < 0 or tool_params["opacity"] > 1
    ):
        raise ValueError("A tool cannot have an opacity outside the range [0,1].")
    if tool_params["lengthConstraint"] and tool_params["lengthConstraint"] < 0:
        raise ValueError("A tool cannot have a negative length constraint.")
    if tool_params["arrowHead"] and tool_params["arrowHead"] < 0:
        raise ValueError("A tool cannot have a negative arrowhead size.")
    return tool_params


def _check_grader(
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
        "tool-id",
        "tolerance",
        "weight",
        "stage",
        "feedback",
        "debug",
    ]
    grader_type = pl.get_string_attrib(grader_tag, "type").strip()
    grader_tools = pl.get_string_attrib(grader_tag, "tool-id")
    tools: list[SketchTool] = []
    for tool_raw in grader_tools.split(","):
        tool = tool_raw.strip()
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
                "x-range",
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
            defaults["tolerance"] = 15
        case (
            "defined-in"
            | "undefined-in"
            | "monot-increasing"
            | "monot-decreasing"
            | "concave-up"
            | "concave-down"
        ):
            optional_attribs.append("x-range")
            for tool in tools:
                if tool["name"] == "horizontal-line":
                    raise ValueError(
                        f'The "{grader_type}" grading criterion does not support the horizontal line tool.'
                    )
                if tool["name"] == "point" and grader_type != "undefined-in":
                    raise ValueError(
                        f'The "{grader_type}" grading criterion does not support the point tool.'
                    )
                if grader_type not in {"defined-in", "undefined-in"} and (
                    tool["name"] == "polyline" and tool["closed"]
                ):
                    raise ValueError(
                        f'The "{grader_type}" grading criterion does not support the polygon tool.'
                    )
                if grader_type != "undefined-in" and tool["name"] == "vertical-line":
                    raise ValueError(
                        f'The "{grader_type}" grading criterion does not support the polygon or vertical line tools.'
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
                if tool["name"] == "horizontal-line" and y_attrib is None:
                    raise ValueError(
                        'The "y" attribute is required to use the "match" grading criterion for horizontal lines.'
                    )
                if tool["name"] == "vertical-line" and x_attrib is None:
                    raise ValueError(
                        'The "x" attribute is required to use the "match" grading criterion for vertical lines.'
                    )
                if x_attrib is None and y_attrib is None:
                    raise ValueError(
                        'Either the "x" or the "y" attribute is required to use the "match" grading criterion.'
                    )
                if endpoint_attrib is not None:
                    if tool["name"] != "line-segment":
                        raise ValueError(
                            'The "endpoint" attribute of the "match" grading criterion can only be used for lines.'
                        )
                    if endpoint_attrib not in ["start", "end", "either"]:
                        raise ValueError(
                            'The "endpoint" attribute of the "match" grading criterion must be "start", "end", or "either".'
                        )
        case "match-function":
            optional_attribs.extend([
                "function",
                "xy-flip",
                "allow-undefined",
                "x-range",
                "y-range",
            ])
            if pl.get_boolean_attrib(grader_tag, "xy-flip", False):
                _split_range(
                    pl.get_string_attrib(grader_tag, "y-range", ","),
                    ranges["y_start"],
                    ranges["y_end"],
                )
            else:
                _split_range(
                    pl.get_string_attrib(grader_tag, "x-range", ","),
                    ranges["x_start"],
                    ranges["x_end"],
                )
            parse_function_string(pl.get_string_attrib(grader_tag, "function"))
            for tool in tools:
                if (
                    tool["name"] == "line-segment"
                    or tool["name"] == "horizontal-line"
                    or tool["name"] == "vertical-line"
                    or (tool["name"] == "polyline" and tool["closed"])
                ):
                    raise ValueError(
                        'The "match-function" grading criterion does not support the line, polygon, or horizontal/vertical line tools.'
                    )
            pl.get_boolean_attrib(grader_tag, "allow-undefined", False)
            defaults["tolerance"] = 15
        case "less-than" | "greater-than":
            optional_attribs.extend([
                "y",
                "function",
                "xy-flip",
                "allow-undefined",
                "x-range",
                "y-range",
            ])
            y_attrib = pl.get_float_attrib(grader_tag, "y", None)
            fun_attrib = pl.get_string_attrib(grader_tag, "function", None)
            if (y_attrib is None and fun_attrib is None) or (
                y_attrib is not None and fun_attrib is not None
            ):
                raise ValueError(
                    f'For the "{grader_type}" grading criterion, exactly one of the attributes "y" and "function" must be set.'
                )
            if fun_attrib is not None:
                parse_function_string(fun_attrib)
            for tool in tools:
                if tool["name"] == "vertical-line":
                    raise ValueError(
                        f'The "{grader_type}" grading criterion does not support the vertical line tool.'
                    )
            pl.get_boolean_attrib(grader_tag, "allow-undefined", False)
            defaults["tolerance"] = 15
        case _:
            raise ValueError("Invalid grader type used: " + grader_type)

    pl.check_attribs(grader_tag, ["type", "tool-id"], optional_attribs)

    tool_params: SketchGrader = {
        "type": grader_type,
        "toolid": tools,
        "weight": pl.get_integer_attrib(grader_tag, "weight", defaults["weight"]),
        "stage": pl.get_integer_attrib(grader_tag, "stage", defaults["stage"]),
        "tolerance": pl.get_integer_attrib(
            grader_tag, "tolerance", int(defaults.get("tolerance", 15))
        ),
        "debug": pl.get_boolean_attrib(grader_tag, "debug", defaults["debug"]),
        "feedback": pl.get_string_attrib(grader_tag, "feedback", None),
        "x": pl.get_float_attrib(grader_tag, "x", None),
        "y": pl.get_float_attrib(grader_tag, "y", None),
        "xrange": _split_range(
            pl.get_string_attrib(grader_tag, "x-range", ","),
            ranges["x_start"],
            ranges["x_end"],
        ),
        "yrange": _split_range(
            pl.get_string_attrib(grader_tag, "y-range", ","),
            ranges["y_start"],
            ranges["y_end"],
        ),
        "endpoint": pl.get_string_attrib(grader_tag, "endpoint", None),
        "count": pl.get_integer_attrib(grader_tag, "count", None),
        "fun": pl.get_string_attrib(grader_tag, "function", None),
        "xyflip": pl.get_boolean_attrib(grader_tag, "xy-flip", None),
        "mode": pl.get_string_attrib(grader_tag, "mode", None),
        "allowundefined": pl.get_boolean_attrib(grader_tag, "allow-undefined", None),
    }

    return tool_params


def _check_drawing(
    drawing_tag: lxml.html.HtmlElement,
    tool_data: dict[str, SketchTool],
    ranges: SketchCanvasSize,
) -> SketchDrawing:
    """
    Checks that a sketch drawing tag (initial or solution) is valid (similar to PL element tag validation, but
    accounting for the many different attributes for each drawing that is referenced by the tag).

    Returns:
        The drawing data converted into a typed dictionary

    Raises:
        ValueError: If data in the tag is invalid
    """
    # check that toolid parameter there for all
    drawing_tool = pl.get_string_attrib(drawing_tag, "tool-id")
    drawing_coords = pl.get_string_attrib(drawing_tag, "coordinates", None)
    drawing_fun = pl.get_string_attrib(drawing_tag, "function", None)
    drawing_xrange = _split_range(
        pl.get_string_attrib(drawing_tag, "x-range", ","),
        ranges["x_start"],
        ranges["x_end"],
    )

    if drawing_tool not in tool_data:
        raise ValueError(f'Drawing tool "{drawing_tool}" is not a valid tool ID.')

    if (drawing_coords is None and drawing_fun is None) or (
        drawing_coords is not None and drawing_fun is not None
    ):
        raise ValueError(
            'Each initial drawing element needs either a "coordinates" or a "function" attribute.'
        )

    if drawing_coords is not None:
        coords = _parse_drawing_coordinates(
            drawing_coords, tool_data[drawing_tool]["name"]
        )
    else:
        coords = []

    match tool_data[drawing_tool]["name"]:
        case "horizontal-line" | "vertical-line":
            if len(coords) != 1:
                raise ValueError(
                    "Drawings for horizontal/vertical tools need exactly one coordinate."
                )
        case "point":
            if len(coords) != 2:
                raise ValueError(
                    "Drawings for points need exactly one coordinate pair."
                )
        case "line-segment":
            if len(coords) != 4:
                raise ValueError(
                    "Drawings for lines need exactly two coordinate pairs."
                )
        case "polyline":
            if len(coords) < 4 or len(coords) % 2 != 0:
                raise ValueError(
                    "Drawings for lines with multiple segments need at least two coordinate pairs."
                )
        case "spline" | "freeform":
            if drawing_fun is not None:
                parse_function_string(drawing_fun)
            elif len(coords) < 4 or len(coords) % 2 != 0:
                raise ValueError(
                    "Drawings for lines with multiple segments need at least two coordinate pairs."
                )
        case _:
            raise ValueError(f'Unknown tool type "{tool_data[drawing_tool]["name"]}"')

    drawing: SketchDrawing = {
        "toolid": drawing_tool,
        "coordinates": coords,
        "fun": drawing_fun,
        "xrange": drawing_xrange,
    }
    return drawing


def _parse_drawing_coordinates(drawing_coords: str, tool_name: str) -> list[float]:
    # Simple case for horizontal and vertical lines where we just need one coordinate value
    if tool_name in {"horizontal-line", "vertical-line"}:
        try:
            return [float(drawing_coords.strip())]
        except ValueError as err:
            raise ValueError(
                f'Invalid coordinate "{drawing_coords}". Drawings for {tool_name} tools need exactly one numeric coordinate.'
            ) from err

    # For other tools, we expect a list of coordinate pairs in the format "(x,y),(x,y),..."
    # We build two regexes based on the same pattern here: one for validation and one for extracting coordinate pairs
    coordinate_pattern = r"\s*\([^(),]+,[^(),]+\)\s*"
    coordinate_regex = re.compile(coordinate_pattern)
    comma_separated_pairs_regex = re.compile(
        rf"^{coordinate_pattern}(,{coordinate_pattern})*$"
    )
    if not comma_separated_pairs_regex.match(drawing_coords):
        raise ValueError(
            f'Invalid coordinate "{drawing_coords}". Drawings for {tool_name} tools need parenthesis-wrapped, comma-separated coordinate pairs.'
        )

    pairs = coordinate_regex.findall(drawing_coords)

    coords: list[float] = []
    for pair in pairs:
        x_str, y_str = pair.strip()[1:-1].split(",")
        coords.extend([float(x_str.strip()), float(y_str.strip())])
    return coords


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")

    params: SketchAnswerParams = data["params"][name]
    config: SketchClientConfig = copy.deepcopy(params["config"])
    solution = params["solution_state"]

    submission = data["raw_submitted_answers"].get(
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
    overlay_solution = pl.get_boolean_attrib(
        element, "overlay-solution", OVERLAY_SOLUTION_DEFAULT
    )

    overlay_displayed = False

    # In the question/submission panel, if overlay_solution is true and the correct answer is shown,
    # overlay the solution drawings translucently on top of the student's submission
    if (
        data["panel"] != "answer"
        and overlay_solution
        and len(solution) > 0
        and data["correct_answer_shown"]
    ):
        overlay_displayed = True
        for tool_id, drawings in solution.items():
            # We need to create a tool copy to be able to set up a different config
            overlay_tool = cast(OverlayTool, dict(params["tool_data"][tool_id]))
            overlay_tool_id = f"{tool_id}-solution-overlay"
            overlay_tool["id"] = overlay_tool_id
            overlay_tool["readonly"] = True
            overlay_tool["overlay"] = True

            # Plugins are rendered in order, so we want to insert solutions at the start (but after the axes, which are at position 0)
            config["plugins"].insert(1, overlay_tool)
            existing = cast(
                list[Any], config["initialstate"].setdefault(overlay_tool_id, [])
            )
            existing.extend(drawings)

    scored = False
    score = None
    feedback = None
    score_class = None
    score_icon = None
    alert_class = None
    if name in data["partial_scores"]:
        scored = True
        score = data["partial_scores"][name]["score"]
        if score is not None:
            score = round(float(score) * 100)
        feedback = data["partial_scores"][name].get("feedback", "")

        if score == 100:
            score_class = alert_class = "success"
            score_icon = "fa-check-circle"
        elif score == 0:
            score_class = alert_class = "danger"
            score_icon = "fa-times-circle"
        else:
            score_class = alert_class = "warning"

    # Each SketchResponse instance needs a unique ID, but only the question panel ID
    # matters because it gets parsed on submission.
    random_id = "".join(random.choice(string.ascii_lowercase) for _ in range(15))

    scoring_params = {
        "scored": scored,
        "score": score,
        "feedback": feedback,
        "score_class": score_class,
        "score_icon": score_icon,
        "alert_class": alert_class,
        "format_error": data["format_errors"].get(name, None),
        "read_only": read_only,
    }

    html_params: dict[str, Any]
    if data["panel"] == "question":
        if read_only or not data["editable"]:
            config["readonly"] = True
        html_params = {"id": name, **scoring_params}
    elif data["panel"] == "submission":
        config["readonly"] = True
        html_params = {"id": random_id, **scoring_params}
    elif len(solution) > 0:  # answer panel (has solution to display)
        config["initialstate"] = solution
        config["readonly"] = True
        html_params = {"id": random_id, "read_only": True}
    else:  # answer panel (no solution to display)
        html_params = {"no_answer": True}

    if not html_params.get("no_answer"):
        html_params["config"] = base64.b64encode(
            json.dumps(config).encode("utf-8")
        ).decode("utf-8")
        html_params["overlay_solution"] = json.dumps(overlay_displayed)

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

    submission = data["raw_submitted_answers"].get(
        name + "-sketchresponse-submission", None
    )
    if submission:
        try:
            submission_parsed = json.loads(base64.b64decode(submission).decode("utf-8"))
            gradeable = submission_parsed["gradeable"]

            # Validate the submission data format here to avoid type or key errors later on
            if not isinstance(gradeable, dict):
                raise TypeError("gradeable must be a dictionary")
            for tool_id, items in gradeable.items():
                if not isinstance(items, list):
                    raise TypeError(f"gradeable[{tool_id}] must be a list")
                for idx, item in enumerate(items):
                    if not isinstance(item, dict):
                        raise TypeError(
                            f"gradeable[{tool_id}][{idx}] must be a dictionary"
                        )
                    has_spline = "spline" in item
                    has_point = "point" in item
                    if not has_spline and not has_point:
                        raise ValueError(
                            f"gradeable[{tool_id}][{idx}] must have either 'spline' or 'point' key"
                        )
                    if has_spline:
                        if not isinstance(item["spline"], list):
                            raise TypeError(
                                f"gradeable[{tool_id}][{idx}]['spline'] must be a list"
                            )
                        for j, coord in enumerate(item["spline"]):
                            if not isinstance(coord, list) or len(coord) != 2:
                                raise TypeError(
                                    f"gradeable[{tool_id}][{idx}]['spline'][{j}] must be a [x, y] pair"
                                )
                            if not all(isinstance(c, (int, float)) for c in coord):
                                raise TypeError(
                                    f"gradeable[{tool_id}][{idx}]['spline'][{j}] must contain numeric values"
                                )
                    if has_point:
                        if (
                            not isinstance(item["point"], list)
                            or len(item["point"]) != 2
                        ):
                            raise TypeError(
                                f"gradeable[{tool_id}][{idx}]['point'] must be a [x, y] pair"
                            )
                        if not all(isinstance(c, (int, float)) for c in item["point"]):
                            raise TypeError(
                                f"gradeable[{tool_id}][{idx}]['point'] must contain numeric values"
                            )
        except Exception as err:
            data["format_errors"][name] = f"Invalid or corrupted submission data: {err}"
            return
    else:
        data["format_errors"][name] = "No graph has been submitted."
        return

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

    # validate that polygons have <= 30 vertices
    # validate that spline-type objects with the same toolid don't overlap each other more than 15 px
    # TODO: Consider moving the second check into the grader since it might be useful to make it configurable for
    # each grading criterion. Arguably, drawing a non-function when a function is requested is an incorrect answer
    # and does not need to be flagged as invalid.
    spline_based_tool_names = ["freeform", "spline", "polyline"]
    params: SketchAnswerParams = data["params"][name]
    tool_data = params["tool_data"]

    # we don't want to check overlap if the graph is flipped for f(y) grading
    no_overlap_check = []
    for grader in params["graders"]:
        if "xyflip" in grader and grader["xyflip"] is True:
            no_overlap_check += [tool["id"] for tool in grader["toolid"]]

    for toolid in gradeable:
        if toolid not in tool_data:
            data["format_errors"][name] = (
                f'Invalid data for tool "{toolid}" in submission.'
            )
            continue
        if tool_data[toolid]["name"] == "polyline" and tool_data[toolid]["closed"]:
            for spline in gradeable[toolid]:
                if "spline" in spline and (len(spline["spline"]) - 1) / 3 > 30:
                    data["format_errors"][name] = (
                        "A drawn polygon/region exceeds the allowed number of vertices (max 30)."
                    )
                    break
        elif (
            tool_data[toolid]["name"] in spline_based_tool_names
            and tool_data[toolid]["id"] not in no_overlap_check
        ):
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
            overlap_tolerance = 5
            for i in range(len(ranges) - 1):
                if ranges[i + 1][0] >= ranges[i][1]:
                    continue
                overlap = min(ranges[i][1], ranges[i + 1][1]) - ranges[i + 1][0]
                if overlap > overlap_tolerance:
                    label = tool_data[toolid]["label"]
                    assert label is not None  # always set by _check_tool
                    data["format_errors"][name] = (
                        f'Multiple "{label}" lines are defined in the same range. '
                        "These lines are interpreted as functions, and only one "
                        "y-value can exist for any x-coordinate."
                    )
                    break


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    # return if read-only
    read_only = pl.get_boolean_attrib(element, "read-only", READ_ONLY_DEFAULT)
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    if read_only:
        return

    data["partial_scores"][name] = _grade_with_staging(name, data, weight)


def _grade_with_staging(name: str, data: pl.QuestionData, weight: int) -> PartialScore:
    """Grade submissions using staged grading logic."""
    params: SketchAnswerParams = data["params"][name]
    graders = params["graders"]

    if len(graders) == 0:
        return {
            "score": 1,
            "weight": weight,
            "feedback": [{"correct": True, "feedback_text": "Correct!"}],
        }

    graders = sorted(graders, key=lambda grader: grader["stage"])
    staged = {}
    for grader in graders:
        staged.setdefault(grader["stage"], []).append(grader)

    debug = any(grader["debug"] for grader in graders)

    # get the score, weight, feedback for each grader
    scores = []
    grader_weights = []
    all_feedback = []
    debug_messages = []
    num_correct = 0

    prev_stage_correct = True
    for stage, graders in staged.items():
        ignore_score = False
        if not prev_stage_correct:
            ignore_score = True
        for grader in graders:
            # We grade all criteria (even if a previous stage failed)
            grader_score, grader_weight, grader_feedback = grade_submission(
                grader, data, name
            )
            grader_weights.append(grader_weight)
            if grader_score == 1:
                if not ignore_score:
                    # Correct answers are only worth points if the previous stage has passed
                    scores.append(1)
                    num_correct += 1
                else:
                    scores.append(0)
            else:
                # Incorrect answers block later stages and also trigger feedback
                scores.append(0)
                all_feedback.append(grader_feedback[0])
                if debug:
                    debug_messages += [grader_feedback]
                if stage != 0:
                    prev_stage_correct = False

    total_weights = sum(grader_weights)
    if total_weights == 0:
        raise ValueError("Total weight of all grading criteria cannot be zero.")
    percentage = 1 / total_weights
    score = round(
        sum(scores[i] * percentage * grader_weights[i] for i in range(len(scores))), 2
    )

    # Print feedback and potentially debug output (if the attribute is set)
    feedback_out = []
    if len(all_feedback) == 0:
        feedback_out += [{"correct": True, "feedback_text": "Correct!"}]
    elif not debug:
        feedback_out += [
            {"correct": False, "feedback_text": feedback}
            for feedback in all_feedback
            if feedback != ""
        ]
    else:
        feedback_out += [
            {
                "correct": False,
                "feedback_text": debug_message[0],
                "debug_mode": len(debug_message) > 1,
                "debug": [{"message": m} for m in debug_message[1:]],
            }
            for debug_message in debug_messages
            if debug_message[0] != ""
        ]
    return {
        "score": score,
        "weight": weight,
        "feedback": feedback_out,
    }


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    readonly = pl.get_boolean_attrib(element, "read-only", READ_ONLY_DEFAULT)

    if readonly:
        return

    name = pl.get_string_attrib(element, "answers-name")
    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    key = name + "-sketchresponse-submission"
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    result = data["test_type"]
    params: SketchAnswerParams = data["params"][name]
    solution_state = params["solution_state"]

    # If no solution is defined, we can't generate correct/incorrect submissions, so test invalid instead
    if result == "invalid" or (len(solution_state) == 0 and not allow_blank):
        data["format_errors"][name] = "No graph has been submitted."
        data["raw_submitted_answers"][key] = base64.b64encode(
            json.dumps({}).encode("utf-8")
        ).decode("utf-8")
        return

    tool_data = params["tool_data"]
    canvas_width = params["config"]["width"]
    canvas_height = params["config"]["height"]

    gradeable = _solution_to_gradeable(
        solution_state, tool_data, canvas_width, canvas_height
    )

    if result == "incorrect":
        # Try to produce a submission based on the solution that is incorrect
        gradeable = _mutate_gradeable(gradeable)

    data["raw_submitted_answers"][key] = base64.b64encode(
        json.dumps({"gradeable": gradeable}).encode("utf-8")
    ).decode("utf-8")

    # Setting submitted_answers because it is needed for invoking grading below
    submitted_answers = data.setdefault("submitted_answers", {})
    submitted_answers[key] = data["raw_submitted_answers"][key]

    # Determine expected grading result by actually running the grading logic
    # Note that depending on the grading criteria and provided solution, it is both possible that the incorrect
    # submission gets some (or all) points, and that the supposedly correct solution gets less than full points
    data["partial_scores"][name] = _grade_with_staging(name, data, weight)

    # Remove only the key we added, since we are not allowed to set submitted_answers in test()
    submitted_answers.pop(key, None)


def _solution_to_gradeable(
    solution_state: dict[str, DrawingData],
    tool_data: dict[str, SketchTool],
    canvas_width: int,
    canvas_height: int,
) -> SketchGradeableData:
    """Convert solution_state (formatted for rendering) to gradeable submission format."""
    gradeable: SketchGradeableData = {}

    for tool_id, drawings in solution_state.items():
        tool_name = tool_data[tool_id]["name"]

        if tool_name == "point":
            # Easy case: just need to convert from {"x": x, "y": y} dict to [x, y] list
            gradeable[tool_id] = [{"point": [pt["x"], pt["y"]]} for pt in drawings]

        elif tool_name in ("spline", "freeform", "polyline", "line-segment"):
            # To convert points into the spline format, we need to add control points in-between each point pair.
            # Note that line-segment is a special case where len(curve) is exactly 2, but the logic works the same
            gradeable[tool_id] = []
            for curve in drawings:
                pts = []
                for i in range(len(curve) - 1):
                    p1 = [curve[i]["x"], curve[i]["y"]]
                    p2 = [curve[i + 1]["x"], curve[i + 1]["y"]]
                    ctrl1 = [
                        p1[0] + (p2[0] - p1[0]) / 3,
                        p1[1] + (p2[1] - p1[1]) / 3,
                    ]
                    ctrl2 = [
                        p1[0] + 2 * (p2[0] - p1[0]) / 3,
                        p1[1] + 2 * (p2[1] - p1[1]) / 3,
                    ]
                    pts += [p1, ctrl1, ctrl2]
                pts.append([curve[-1]["x"], curve[-1]["y"]])
                gradeable[tool_id].append({"spline": pts})

        elif tool_name == "horizontal-line":
            # For horizontal lines, we replace the arbitrary y-value with a spline that spans the canvas
            gradeable[tool_id] = [
                {
                    "spline": [
                        [0, d["y"]],
                        [canvas_width / 3, d["y"]],
                        [2 * canvas_width / 3, d["y"]],
                        [canvas_width, d["y"]],
                    ]
                }
                for d in drawings
            ]

        elif tool_name == "vertical-line":
            # For vertical lines, we replace the arbitrary x-value with a spline that spans the canvas
            gradeable[tool_id] = [
                {
                    "spline": [
                        [d["x"], 0],
                        [d["x"], canvas_height / 3],
                        [d["x"], 2 * canvas_height / 3],
                        [d["x"], canvas_height],
                    ]
                }
                for d in drawings
            ]

    # Fill empty lists for tools not in solution
    for tid in tool_data:
        if tid not in gradeable:
            gradeable[tid] = []

    return gradeable


def _mutate_gradeable(
    gradeable: SketchGradeableData, offset: float = 200
) -> SketchGradeableData:
    """Mutate gradeable data to produce an incorrect submission.

    Applies two transformations to break as many grader types as possible:
    1. Reverses point order within each spline (breaks monotonicity, concavity)
    2. Shifts all y-coordinates (breaks absolute position checks like match,
       match-function, greater-than, less-than)

    Returns:
        A mutated copy of the gradeable data.
    """
    mutated = copy.deepcopy(gradeable)
    for items in mutated.values():
        for item in items:
            if "spline" in item:
                item["spline"] = [[x, y + offset] for x, y in reversed(item["spline"])]
            if "point" in item:
                item["point"] = [item["point"][0], item["point"][1] + offset]
    return mutated
