import ast
import math


def validate_initial_set_points(ind, name, tool):
    valid_params = {"toolid", "coordinates"}
    used_params = non_nonetype_params(ind)
    if used_params != valid_params:
        raise ValueError(
            name
            + ": invalid parameters for initial element with id "
            + ind["toolid"]
            + ". Required parameters are "
            + str(valid_params)
            + "."
        )
    # check coordinates requirements
    try:
        coordinates = ind["coordinates"].replace("(", "").replace(")", "")
        coordinates = [float(i) for i in coordinates.split(",")]
    except Exception:
        raise ValueError(
            name
            + ": One or more coordinates entered for initial with id "
            + ind["toolid"]
            + " is not a valid float."
        ) from None

    single_axis_tools = ["vertical-line", "horizontal-line"]

    if len(coordinates) < 1:
        raise ValueError(
            name
            + ": 'coordinates' parameter requires a list of numbers for tool with id "
            + ind["toolid"]
            + "."
        )

    if tool == "point":
        if len(coordinates) % 2 != 0:
            raise ValueError(
                name
                + ": Incomplete coordinate pairs for tool "
                + ind["toolid"]
                + ". Make sure the list in 'coordinates' is divisible by 2."
            )
    elif tool not in single_axis_tools and (
        len(coordinates) % 2 != 0 or len(coordinates) < 4
    ):
        raise ValueError(
            name
            + ": Each rendered initial of id "
            + ind["toolid"]
            + " requires two coordinate pairs. Make sure the list in 'coordinates' is divisible by 4."
        )
    initial = {"toolid": ind["toolid"], "coordinates": coordinates}
    return initial


# spline-tool free-draw-tool
def validate_initial_n_points(ind, name, tool, ranges):
    valid_params = {"toolid", "fun", "xrange", "coordinates"}
    used_params = non_nonetype_params(ind)
    coordinates = None
    if len(used_params - set(valid_params)) != 0:
        raise ValueError(
            name
            + ": Initial with id "
            + ind["toolid"]
            + " can only have the following parameters: "
            + str(valid_params)
            + "."
        )
    if (ind["fun"] is None) == (ind["coordinates"] is None):
        raise ValueError(
            name
            + ': (Only) one of "fun" and "coordinates" should be set for initial with id '
            + ind["toolid"]
            + "."
        )
    if ind["xrange"] and len(ind["xrange"].split(",")) != 2:
        raise ValueError(
            name
            + ': "xrange" must be a list of two values in initial with id '
            + ind["toolid"]
            + "."
        )
    if ind["coordinates"] is None and (tool in {"polyline", "polygon"}):
        raise ValueError(
            name
            + ': The polyline-tool and polygon-tool can only use the "coordinates" parameter to render an initial element on the graph.'
        )

    if ind["coordinates"] is not None:
        if ind["xrange"] is not None:
            raise ValueError(
                name
                + ": 'xrange' cannot be set if 'coordinates' is set for "
                + ind["toolid"]
                + "."
            )
        try:
            coordinates = ind["coordinates"].replace("(", "").replace(")", "")
            coordinates = [float(i) for i in coordinates.split(",")]
        except Exception:
            raise ValueError(
                name
                + ": One or more coordinates entered for initial with id "
                + ind["toolid"]
                + " is not a valid float."
            ) from None
        if len(coordinates) < 4:
            raise ValueError(
                name
                + ": Initial with id "
                + ind["toolid"]
                + " requires at least two coordinate pairs."
            )
        if len(coordinates) % 2 != 0:
            raise ValueError(
                name
                + ": For initial with id "
                + ind["toolid"]
                + ", make sure the list in 'coordinates' is divisible by 2."
            )

    ind["xrange"] = format_xrange(ind["xrange"], ranges)
    if ind["fun"] is not None:
        initial = {"toolid": ind["toolid"], "fun": ind["fun"], "xrange": ind["xrange"]}
        return initial
    elif coordinates:
        initial = {"toolid": ind["toolid"], "coordinates": coordinates}
        return initial
    else:
        return {}


# Helper Functions ###


def non_nonetype_params(ind):

    non_nonetypes = [key for key in ind if ind[key] is not None]
    return set(non_nonetypes)


def format_xrange(xrange, ranges):
    if xrange is None:
        return str(ranges["x_start"]) + "," + str(ranges["x_end"])
    xrange_list = xrange.split(",")
    if xrange_list[0].strip() == "":
        xrange_list[0] = str(ranges["x_start"])
    if xrange_list[1].strip() == "":
        xrange_list[1] = str(ranges["x_end"])
    return ",".join(xrange_list)


# Function Rendering Tools ###


def parse_function_string(s):
    if s is None:
        return None

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
