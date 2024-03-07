import collections
import html
import importlib
import importlib.util
import itertools as it
import json
import math
import numbers
import os
import random
import re
import string
import unicodedata
import uuid
from enum import Enum
from io import StringIO
from typing import Any, Callable, Generator, Literal, Type, TypedDict, TypeVar, overload

import lxml.html
import networkx as nx
import numpy as np
import pandas
import python_helper_sympy as phs
import sympy
import to_precision
from colors import PLColor
from numpy.typing import ArrayLike
from pint import UnitRegistry
from text_unidecode import unidecode
from typing_extensions import NotRequired, assert_never


class PartialScore(TypedDict):
    "A class with type signatures for the partial scores dict"
    score: float | None
    weight: NotRequired[int]
    feedback: NotRequired[str]


# TODO: This type definition should not yet be seen as authoritative, it may
# need to be modified as we expand type checking to cover more of the element code.
# The fields below containing 'Any' in the types are ones which are used
# in different ways by different question elements. Ideally we would have
# QuestionData be a generic type so that question elements could declare types
# for their answer data, feedback data, etc., but TypedDicts with Generics are
# not yet supported: https://bugs.python.org/issue44863
class QuestionData(TypedDict):
    "A class with type signatures for the data dictionary"

    params: dict[str, Any]
    correct_answers: dict[str, Any]
    submitted_answers: dict[str, Any]
    format_errors: dict[str, Any]
    partial_scores: dict[str, PartialScore]
    score: float
    feedback: dict[str, Any]
    variant_seed: str
    options: dict[str, Any]
    raw_submitted_answers: dict[str, Any]
    editable: bool
    panel: Literal["question", "submission", "answer"]
    extensions: dict[str, Any]
    num_valid_submissions: int
    manual_grading: bool
    answers_names: dict[str, bool]


class ElementTestData(QuestionData):
    test_type: Literal["correct", "incorrect", "invalid"]


def check_answers_names(data: QuestionData, name: str) -> None:
    """Checks that answers names are distinct using property in data dict."""
    if name in data["answers_names"]:
        raise KeyError(f'Duplicate "answers-name" attribute: "{name}"')
    else:
        data["answers_names"][name] = True


def get_unit_registry() -> UnitRegistry:
    """Get a unit registry using cache folder valid on production machines."""

    pid = os.getpid()
    cache_dir = f"/tmp/pint_{pid}"
    return UnitRegistry(cache_folder=cache_dir)


def grade_answer_parameterized(
    data: QuestionData,
    question_name: str,
    grade_function: Callable[[Any], tuple[bool | float, str | None]],
    weight: int = 1,
) -> None:
    """
    Grade question question_name. grade_function should take in a single parameter
    (which will be the submitted answer) and return a 2-tuple:
        - The first element of the 2-tuple should either be:
            - a boolean indicating whether the question should be marked correct
            - a partial score between 0 and 1, inclusive
        - The second element of the 2-tuple should either be:
            - a string containing feedback
            - None, if there is no feedback (usually this should only occur if the answer is correct)
    """

    # Create the data dictionary at first
    data["partial_scores"][question_name] = {"score": 0.0, "weight": weight}

    # If there is no submitted answer, we shouldn't do anything. Issues with blank
    # answers should be handled in parse.
    if question_name not in data["submitted_answers"]:
        return

    submitted_answer = data["submitted_answers"][question_name]

    # Run passed-in grading function
    result, feedback_content = grade_function(submitted_answer)

    # Try converting partial score
    if isinstance(result, bool):
        partial_score = 1.0 if result else 0.0
    elif isinstance(result, (float, int)):
        assert 0.0 <= result <= 1.0
        partial_score = result
    else:
        assert_never(result)

    # Set corresponding partial score and feedback
    data["partial_scores"][question_name]["score"] = partial_score

    if feedback_content:
        data["partial_scores"][question_name]["feedback"] = feedback_content


def determine_score_params(
    score: float,
) -> tuple[Literal["correct", "partial", "incorrect"], bool | float]:
    """
    Determine appropriate key and value for display on the frontend given the
    score for a particular question. For elements following PrairieLearn
    conventions, the return value can be used as a key/value pair in the
    dictionary passed to an element's Mustache template to display a score badge.
    """

    if score >= 1:
        return ("correct", True)
    elif score > 0:
        return ("partial", math.floor(score * 100))

    return ("incorrect", True)


EnumT = TypeVar("EnumT", bound=Enum)


def get_enum_attrib(
    element: lxml.html.HtmlElement,
    name: str,
    enum_type: Type[EnumT],
    default: EnumT | None = None,
) -> EnumT:
    """
    Returns the named attribute for the element parsed as an enum,
    or the (optional) default value. If the default value is not provided
    and the attribute is missing then an exception is thrown. An exception
    is also thrown if the value for the enum provided is invalid.
    Also, alters the enum names to comply with PL naming convention automatically
    (replacing underscores with dashes and uppercasing). If default value is
    provided, must be a member of the given enum.
    """

    enum_val, is_default = (
        _get_attrib(element, name)
        if default is None
        else _get_attrib(element, name, default)
    )

    # Default doesn't need to be converted, already a value of the enum
    if is_default:
        return enum_val

    if enum_val != enum_val.lower():
        raise ValueError(
            f'Value "{enum_val}" assigned to "{name}" cannot have uppercase characters.'
        )

    upper_enum_str = enum_val.upper()
    accepted_names = {member.name.replace("_", "-") for member in enum_type}

    if upper_enum_str not in accepted_names:
        raise ValueError(
            f"{enum_val} is not a valid type, must be one of: {', '.join(member.name.lower().replace('_', '-') for member in enum_type)}."
        )

    return enum_type[upper_enum_str.replace("-", "_")]


def set_weighted_score_data(data: QuestionData, weight_default: int = 1) -> None:
    """
    Sets overall question score to be weighted average of all partial scores. Uses
    weight_default to fill in a default weight for a score if one is missing.
    """

    weight_total = 0
    score_total = 0.0
    for part in data["partial_scores"].values():
        score = part["score"]
        weight = part.get("weight", weight_default)

        if score is None:
            raise ValueError("Can't set weighted score data if score is None.")

        score_total += score * weight
        weight_total += weight

    data["score"] = score_total / weight_total


def set_all_or_nothing_score_data(data: QuestionData) -> None:
    """Gives points to main question score if all partial scores are correct."""

    data["score"] = 1.0 if all_partial_scores_correct(data) else 0.0


def all_partial_scores_correct(data: QuestionData) -> bool:
    """Return true if all questions are correct in partial scores and it's nonempty."""
    partial_scores = data["partial_scores"]

    if len(partial_scores) == 0:
        return False

    return all(
        part["score"] is not None and math.isclose(part["score"], 1.0)
        for part in partial_scores.values()
    )


def to_json(v, *, df_encoding_version=1, np_encoding_version=1):
    """to_json(v)

    If v has a standard type that cannot be json serialized, it is replaced with
    a {'_type':..., '_value':...} pair that can be json serialized:

        If np_encoding_version is set to 2, will serialize numpy scalars as follows:

        numpy scalar -> '_type': 'np_scalar'

        If df_encoding_version is set to 2, will serialize pandas DataFrames as follows:

        pandas.DataFrame -> '_type': 'dataframe_v2'

        Otherwise, the following mappings are used:

        any complex scalar (including numpy) -> '_type': 'complex'
        non-complex ndarray (assumes each element can be json serialized) -> '_type': 'ndarray'
        complex ndarray -> '_type': 'complex_ndarray'
        sympy.Expr (i.e., any scalar sympy expression) -> '_type': 'sympy'
        sympy.Matrix -> '_type': 'sympy_matrix'
        pandas.DataFrame -> '_type': 'dataframe'
        any networkx graph type -> '_type': 'networkx_graph'

    Note that the 'dataframe_v2' encoding allows for missing and date time values whereas
    the 'dataframe' (default) does not. However, the 'dataframe' encoding allows for complex
    numbers while 'dataframe_v2' does not.

    If v is an ndarray, this function preserves its dtype (by adding '_dtype' as
    a third field in the dictionary).

    If v can be json serialized or does not have a standard type, then it is
    returned without change.
    """
    if np_encoding_version not in {1, 2}:
        raise ValueError(f"Invaild np_encoding {np_encoding_version}, must be 1 or 2.")

    if np_encoding_version == 2 and isinstance(v, np.number):
        return {
            "_type": "np_scalar",
            "_concrete_type": type(v).__name__,
            "_value": str(v),
        }

    if np.isscalar(v) and np.iscomplexobj(v):
        return {"_type": "complex", "_value": {"real": v.real, "imag": v.imag}}
    elif isinstance(v, np.ndarray):
        if np.isrealobj(v):
            return {"_type": "ndarray", "_value": v.tolist(), "_dtype": str(v.dtype)}
        elif np.iscomplexobj(v):
            return {
                "_type": "complex_ndarray",
                "_value": {"real": v.real.tolist(), "imag": v.imag.tolist()},
                "_dtype": str(v.dtype),
            }
    elif isinstance(v, sympy.Expr):
        return phs.sympy_to_json(v)
    elif isinstance(v, sympy.Matrix) or isinstance(v, sympy.ImmutableMatrix):
        s = [str(a) for a in v.free_symbols]
        num_rows, num_cols = v.shape
        M = []
        for i in range(0, num_rows):
            row = []
            for j in range(0, num_cols):
                row.append(str(v[i, j]))
            M.append(row)
        return {
            "_type": "sympy_matrix",
            "_value": M,
            "_variables": s,
            "_shape": [num_rows, num_cols],
        }
    elif isinstance(v, pandas.DataFrame):
        if df_encoding_version == 1:
            return {
                "_type": "dataframe",
                "_value": {
                    "index": list(v.index),
                    "columns": list(v.columns),
                    "data": v.values.tolist(),
                },
            }

        elif df_encoding_version == 2:
            # The next lines of code are required to address the JSON table-orient
            # generating numeric keys instead of strings for an index sequence with
            # only numeric values (c.f. pandas-dev/pandas#46392)
            df_modified_names = v.copy()

            if df_modified_names.columns.dtype in (np.float64, np.int64):
                df_modified_names.columns = df_modified_names.columns.astype("string")

            # For version 2 storing a data frame, we use the table orientation alongside of
            # enforcing a date format to allow for passing datetime and missing (`pd.NA`/`np.nan`) values
            # Details: https://pandas.pydata.org/docs/reference/api/pandas.read_json.html
            # Convert to JSON string with escape characters
            encoded_json_str_df = df_modified_names.to_json(
                orient="table", date_format="iso"
            )
            # Export to native JSON structure
            pure_json_df = json.loads(encoded_json_str_df)

            return {"_type": "dataframe_v2", "_value": pure_json_df}

        else:
            raise ValueError(
                f"Invalid df_encoding_version: {df_encoding_version}. Must be 1 or 2"
            )
    elif isinstance(v, (nx.Graph, nx.DiGraph, nx.MultiGraph, nx.MultiDiGraph)):
        return {"_type": "networkx_graph", "_value": nx.adjacency_data(v)}
    else:
        return v


def from_json(v):
    """from_json(v)

    If v has the format {'_type':..., '_value':...} as would have been created
    using to_json(...), then it is replaced:

        '_type': 'complex' -> complex
        '_type': 'np_scalar' -> numpy scalar defined by '_concrete_type'
        '_type': 'ndarray' -> non-complex ndarray
        '_type': 'complex_ndarray' -> complex ndarray
        '_type': 'sympy' -> sympy.Expr
        '_type': 'sympy_matrix' -> sympy.Matrix
        '_type': 'dataframe' -> pandas.DataFrame
        '_type': 'dataframe_v2' -> pandas.DataFrame
        '_type': 'networkx_graph' -> corresponding networkx graph

    If v encodes an ndarray and has the field '_dtype', this function recovers
    its dtype.

    If v does not have the format {'_type':..., '_value':...}, then it is
    returned without change.
    """
    if isinstance(v, dict):
        if "_type" in v:
            if v["_type"] == "complex":
                if (
                    ("_value" in v)
                    and ("real" in v["_value"])
                    and ("imag" in v["_value"])
                ):
                    return complex(v["_value"]["real"], v["_value"]["imag"])
                else:
                    raise Exception(
                        "variable of type complex should have value with real and imaginary pair"
                    )
            elif v["_type"] == "np_scalar":
                if "_concrete_type" in v and "_value" in v:
                    return getattr(np, v["_concrete_type"])(v["_value"])
                else:
                    raise Exception(
                        f"variable of type {v['_type']} needs both concrete type and value information"
                    )
            elif v["_type"] == "ndarray":
                if "_value" in v:
                    if "_dtype" in v:
                        return np.array(v["_value"]).astype(v["_dtype"])
                    else:
                        return np.array(v["_value"])
                else:
                    raise Exception("variable of type ndarray should have value")
            elif v["_type"] == "complex_ndarray":
                if (
                    ("_value" in v)
                    and ("real" in v["_value"])
                    and ("imag" in v["_value"])
                ):
                    if "_dtype" in v:
                        return (
                            np.array(v["_value"]["real"])
                            + np.array(v["_value"]["imag"]) * 1j
                        ).astype(v["_dtype"])
                    else:
                        return (
                            np.array(v["_value"]["real"])
                            + np.array(v["_value"]["imag"]) * 1j
                        )
                else:
                    raise Exception(
                        "variable of type complex_ndarray should have value with real and imaginary pair"
                    )
            elif v["_type"] == "sympy":
                return phs.json_to_sympy(v)
            elif v["_type"] == "sympy_matrix":
                if ("_value" in v) and ("_variables" in v) and ("_shape" in v):
                    value = v["_value"]
                    variables = v["_variables"]
                    shape = v["_shape"]
                    M = sympy.Matrix.zeros(shape[0], shape[1])
                    for i in range(0, shape[0]):
                        for j in range(0, shape[1]):
                            M[i, j] = phs.convert_string_to_sympy(
                                value[i][j], variables
                            )
                    return M
                else:
                    raise Exception(
                        "variable of type sympy_matrix should have value, variables, and shape"
                    )
            elif v["_type"] == "dataframe":
                if (
                    ("_value" in v)
                    and ("index" in v["_value"])
                    and ("columns" in v["_value"])
                    and ("data" in v["_value"])
                ):
                    val = v["_value"]
                    return pandas.DataFrame(
                        index=val["index"], columns=val["columns"], data=val["data"]
                    )
                else:
                    raise Exception(
                        "variable of type dataframe should have value with index, columns, and data"
                    )
            elif v["_type"] == "dataframe_v2":
                # Convert native JSON back to a string representation so that
                # pandas read_json() can process it.
                value_str = StringIO(json.dumps(v["_value"]))
                return pandas.read_json(value_str, orient="table")
            elif v["_type"] == "networkx_graph":
                return nx.adjacency_graph(v["_value"])
            else:
                raise Exception("variable has unknown type {:s}".format(v["_type"]))
    return v


def inner_html(element: lxml.html.HtmlElement) -> str:
    inner = element.text
    if inner is None:
        inner = ""
    inner = html.escape(str(inner))
    for child in element:
        inner += lxml.html.tostring(child, method="html").decode("utf-8")
    return inner


def compat_get(object, attrib, default):
    if attrib in object:
        return object[attrib]
    old_attrib = attrib.replace("-", "_")
    return old_attrib in object


def compat_array(arr: list[str]) -> list[str]:
    new_arr = []
    for i in arr:
        new_arr.append(i)
        new_arr.append(i.replace("-", "_"))
    return new_arr


def check_attribs(
    element: lxml.html.HtmlElement,
    required_attribs: list[str],
    optional_attribs: list[str],
) -> None:
    for name in required_attribs:
        if not has_attrib(element, name):
            raise Exception('Required attribute "%s" missing' % name)
    extra_attribs = list(
        set(element.attrib)
        - set(compat_array(required_attribs))
        - set(compat_array(optional_attribs))
    )
    for name in extra_attribs:
        raise Exception('Unknown attribute "%s"' % name)


def _get_attrib(element, name, *args):
    """(value, is_default) = _get_attrib(element, name, default)

    Internal function, do not all. Use one of the typed variants
    instead (e.g., get_string_attrib()).

    Returns the named attribute for the element, or the default value
    if the attribute is missing.  The default value is optional. If no
    default value is provided and the attribute is missing then an
    exception is thrown. The second return value indicates whether the
    default value was returned.
    """
    # It seems like we could use keyword arguments with a default
    # value to handle the "default" argument, but we want to be able
    # to distinguish between default=None and no default being passed,
    # which means we need to explicitly handle the optional argument
    if len(args) > 1:
        raise Exception("Only one additional argument is allowed")

    if name in element.attrib:
        return (element.attrib[name], False)

    # We need to check for the legacy _ version
    old_name = name.replace("-", "_")
    if old_name in element.attrib:
        return (element.attrib[old_name], False)

    # Provide a default if we can
    if len(args) == 1:
        return (args[0], True)

    raise Exception('Attribute "%s" missing and no default is available' % name)


def has_attrib(element: lxml.html.HtmlElement, name: str) -> bool:
    """value = has_attrib(element, name)

    Returns true if the element has an attribute of that name,
    false otherwise.
    """
    old_name = name.replace("-", "_")
    return name in element.attrib or old_name in element.attrib


# Order here matters, as we want to override the case where the args is omitted
@overload
def get_string_attrib(element: lxml.html.HtmlElement, name: str) -> str: ...


@overload
def get_string_attrib(element: lxml.html.HtmlElement, name: str, *args: str) -> str: ...


@overload
def get_string_attrib(
    element: lxml.html.HtmlElement, name: str, *args: None
) -> str | None: ...


def get_string_attrib(element, name, *args):
    """value = get_string_attrib(element, name, default)

    Returns the named attribute for the element, or the (optional)
    default value. If the default value is not provided and the
    attribute is missing then an exception is thrown.
    """
    (str_val, is_default) = _get_attrib(element, name, *args)
    return str_val


# Order here matters, as we want to override the case where the args is omitted
@overload
def get_boolean_attrib(element: lxml.html.HtmlElement, name: str) -> bool: ...


@overload
def get_boolean_attrib(
    element: lxml.html.HtmlElement, name: str, *args: bool
) -> bool: ...


@overload
def get_boolean_attrib(
    element: lxml.html.HtmlElement, name: str, *args: None
) -> bool | None: ...


def get_boolean_attrib(element, name, *args):
    """value = get_boolean_attrib(element, name, default)

    Returns the named attribute for the element, or the (optional)
    default value. If the default value is not provided and the
    attribute is missing then an exception is thrown. If the attribute
    is not a valid boolean then an exception is thrown.
    """
    (val, is_default) = _get_attrib(element, name, *args)
    if is_default:
        return val

    true_values = ["true", "t", "1", "True", "T", "TRUE", "yes", "y", "Yes", "Y", "YES"]
    false_values = [
        "false",
        "f",
        "0",
        "False",
        "F",
        "FALSE",
        "no",
        "n",
        "No",
        "N",
        "NO",
    ]

    if val in true_values:
        return True
    elif val in false_values:
        return False
    else:
        raise Exception('Attribute "%s" must be a boolean value: %s' % (name, val))


# Order here matters, as we want to override the case where the args is omitted
@overload
def get_integer_attrib(element: lxml.html.HtmlElement, name: str) -> int: ...


@overload
def get_integer_attrib(
    element: lxml.html.HtmlElement, name: str, *args: int
) -> int: ...


@overload
def get_integer_attrib(
    element: lxml.html.HtmlElement, name: str, *args: None
) -> int | None: ...


def get_integer_attrib(element, name, *args):
    """value = get_integer_attrib(element, name, default)

    Returns the named attribute for the element, or the (optional)
    default value. If the default value is not provided and the
    attribute is missing then an exception is thrown. If the attribute
    is not a valid integer then an exception is thrown.
    """
    (val, is_default) = _get_attrib(element, name, *args)
    if is_default:
        return val
    try:
        int_val = int(val)
    except ValueError:
        int_val = None
    if int_val is None:
        # can't raise this exception directly in the above except
        # handler because it gives an overly complex displayed error
        raise Exception('Attribute "%s" must be an integer: %s' % (name, val))
    return int_val


def get_float_attrib(element, name, *args):
    """value = get_float_attrib(element, name, default)

    Returns the named attribute for the element, or the (optional)
    default value. If the default value is not provided and the
    attribute is missing then an exception is thrown. If the attribute
    is not a valid floating-point number then an exception is thrown.
    """
    (val, is_default) = _get_attrib(element, name, *args)
    if is_default:
        return val
    try:
        float_val = float(val)
    except ValueError:
        float_val = None
    if float_val is None:
        # can't raise this exception directly in the above except
        # handler because it gives an overly complex displayed error
        raise Exception('Attribute "%s" must be a number: %s' % (name, val))
    return float_val


@overload
def get_color_attrib(element: lxml.html.HtmlElement, name: str, *args: str) -> str: ...


@overload
def get_color_attrib(
    element: lxml.html.HtmlElement, name: str, *args: None
) -> str | None: ...


def get_color_attrib(element, name, *args):
    """value = get_color_attrib(element, name, default)

    Returns a 3-digit or 6-digit hex RGB string in CSS format (e.g., '#123'
    or '#1a2b3c'), or the (optional) default value. If the default value is
    not provided and the attribute is missing then an exception is thrown. If
    the attribute is not a valid RGB string then it will be checked against various
    named colors.  If the attribute is still not valid an exception is thrown.
    """
    (val, is_default) = _get_attrib(element, name, *args)
    if is_default:
        # Allow for `None` default
        if val is None:
            return val

        if PLColor.match(val) is not None:
            return PLColor(val).to_string(hex=True)
        else:
            return val

    match = re.search(r"^#(?:[0-9a-fA-F]{1,2}){3}$", val)
    if match:
        return val
    else:
        if PLColor.match(val) is not None:
            return PLColor(val).to_string(hex=True)
        else:
            raise Exception(
                'Attribute "{:s}" must be a CSS-style RGB string: {:s}'.format(
                    name, val
                )
            )


def numpy_to_matlab(A, ndigits=2, wtype="f"):
    """numpy_to_matlab(A, ndigits=2, wtype='f')

    This function assumes that A is one of these things:

        - a number (float or complex)
        - a 2D ndarray (float or complex)

    It returns A as a MATLAB-formatted string in which each number has "ndigits"
    digits after the decimal and is formatted as "wtype" (e.g., 'f', 'g', etc.).
    """
    if np.isscalar(A):
        A_str = "{:.{indigits}{iwtype}}".format(A, indigits=ndigits, iwtype=wtype)
        return A_str
    elif A.ndim == 1:
        s = A.shape
        m = s[0]
        A_str = "["
        for i in range(0, m):
            A_str += "{:.{indigits}{iwtype}}".format(
                A[i], indigits=ndigits, iwtype=wtype
            )
            if i < m - 1:
                A_str += ", "
        A_str += "]"
        return A_str
    else:
        s = A.shape
        m = s[0]
        n = s[1]
        A_str = "["
        for i in range(0, m):
            for j in range(0, n):
                A_str += "{:.{indigits}{iwtype}}".format(
                    A[i, j], indigits=ndigits, iwtype=wtype
                )
                if j == n - 1:
                    if i == m - 1:
                        A_str += "]"
                    else:
                        A_str += "; "
                else:
                    A_str += " "
        return A_str


def string_from_numpy(A, language="python", presentation_type="f", digits=2):
    """string_from_numpy(A)

    This function assumes that A is one of these things:

        - a number (float or complex)
        - a 1D ndarray (float or complex)
        - a 2D ndarray (float or complex)

    It returns A as a string.

    If language is 'python' and A is a 2D ndarray, the string looks like this:

        [[ ..., ... ], [ ..., ... ]]

    If A is a 1D ndarray, the string looks like this:

        [ ..., ..., ... ]

    If language is 'matlab' and A is a 2D ndarray, the string looks like this:

        [ ... ... ; ... ... ]

    If A is a 1D ndarray, the string looks like this:

        [ ..., ..., ... ]

    If language is 'mathematica' and A is a 2D ndarray, the string looks like this:

        {{ ..., ... },{ ..., ... }}

    If A is a 1D ndarray, the string looks like this:

        { ..., ..., ... }

    If language is 'r' and A is a 2D ndarray, the string looks like this:

        matrix(c(., ., .), nrow=NUM_ROWS, ncol=NUM_COLS, byrow = TRUE)

    If A is a 1D ndarray, the string looks like this:

        c(., ., .)

    If language is 'sympy' and A is a 2D ndarray, the string looks like this:
        Matrix([[ ..., ... ], [ ..., ... ]])

    If A is a 1D ndarray, the string looks like this:
        Matrix([ ..., ..., ... ])

    In either case, if A is not a 1D or 2D ndarray, the string is a single number,
    not wrapped in brackets.

    If presentation_type is 'sigfig', each number is formatted using the
    to_precision module to "digits" significant figures.

    Otherwise, each number is formatted as '{:.{digits}{presentation_type}}'.
    """

    # if A is a scalar
    if np.isscalar(A):
        if presentation_type == "sigfig":
            return string_from_number_sigfig(A, digits=digits)
        else:
            return "{:.{digits}{presentation_type}}".format(
                A, digits=digits, presentation_type=presentation_type
            )

    # if A is a 1D or 2D ndarray
    if language == "python":
        if presentation_type == "sigfig":
            formatter = {
                "float_kind": lambda x: to_precision.to_precision(x, digits),
                "complex_kind": lambda x: _string_from_complex_sigfig(x, digits),
            }
        else:
            formatter = {
                "float_kind": lambda x: "{:.{digits}{presentation_type}}".format(
                    x, digits=digits, presentation_type=presentation_type
                ),
                "complex_kind": lambda x: "{:.{digits}{presentation_type}}".format(
                    x, digits=digits, presentation_type=presentation_type
                ),
            }
        return np.array2string(A, formatter=formatter, separator=", ").replace("\n", "")
    elif language == "matlab":
        if presentation_type == "sigfig":
            return numpy_to_matlab_sf(A, ndigits=digits)
        else:
            return numpy_to_matlab(A, ndigits=digits, wtype=presentation_type)
    elif language == "mathematica":
        if presentation_type == "sigfig":
            formatter = {
                "float_kind": lambda x: to_precision.to_precision(x, digits),
                "complex_kind": lambda x: _string_from_complex_sigfig(x, digits),
            }
        else:
            formatter = {
                "float_kind": lambda x: "{:.{digits}{presentation_type}}".format(
                    x, digits=digits, presentation_type=presentation_type
                ),
                "complex_kind": lambda x: "{:.{digits}{presentation_type}}".format(
                    x, digits=digits, presentation_type=presentation_type
                ),
            }
        result = np.array2string(A, formatter=formatter, separator=", ").replace(
            "\n", ""
        )
        result = result.replace("[", "{")
        result = result.replace("]", "}")
        return result
    elif language == "r":
        if presentation_type == "sigfig":
            formatter = {
                "float_kind": lambda x: to_precision.to_precision(x, digits),
                "complex_kind": lambda x: _string_from_complex_sigfig(x, digits),
            }
        else:
            formatter = {
                "float_kind": lambda x: "{:.{digits}{presentation_type}}".format(
                    x, digits=digits, presentation_type=presentation_type
                ),
                "complex_kind": lambda x: "{:.{digits}{presentation_type}}".format(
                    x, digits=digits, presentation_type=presentation_type
                ),
            }
        result = np.array2string(A, formatter=formatter, separator=", ").replace(
            "\n", ""
        )
        # Given as: [[1, 2, 3], [4, 5, 6]]
        result = result.replace("[", "")
        result = result.replace("]", "")
        # Cast to a vector: c(1, 2, 3, 4, 5, 6)
        result = f"c({result})"
        if A.ndim == 2:
            nrow = A.shape[0]
            ncol = A.shape[1]
            result = f"matrix({result}, nrow = {nrow}, ncol = {ncol}, byrow = TRUE)"
        return result
    elif language == "sympy":
        if presentation_type == "sigfig":
            formatter = {
                "float_kind": lambda x: to_precision.to_precision(x, digits),
                "complex_kind": lambda x: _string_from_complex_sigfig(x, digits),
            }
        else:
            formatter = {
                "float_kind": lambda x: "{:.{digits}{presentation_type}}".format(
                    x, digits=digits, presentation_type=presentation_type
                ),
                "complex_kind": lambda x: "{:.{digits}{presentation_type}}".format(
                    x, digits=digits, presentation_type=presentation_type
                ),
            }
        result = np.array2string(A, formatter=formatter, separator=", ").replace(
            "\n", ""
        )
        # Cast to a vector: Matrix([1, 2, 3, 4, 5, 6])
        result = f"Matrix({result})"
        return result
    else:
        raise Exception(
            'language "{:s}" must be either "python", "matlab", "mathematica", "r", or "sympy"'.format(
                language
            )
        )


# Deprecated version, keeping for backwards compatibility
def string_from_2darray(A, language="python", presentation_type="f", digits=2):
    result = string_from_numpy(A, language, presentation_type, digits)
    return result


def string_from_number_sigfig(a, digits=2):
    """_string_from_complex_sigfig(a, digits=2)

    This function assumes that "a" is of type float or complex. It returns "a"
    as a string in which the number, or both the real and imaginary parts of the
    number, have digits significant digits.
    """
    if np.iscomplexobj(a):
        return _string_from_complex_sigfig(a, digits=digits)
    else:
        return to_precision.to_precision(a, digits)


def _string_from_complex_sigfig(a, digits=2):
    """_string_from_complex_sigfig(a, digits=2)

    This function assumes that "a" is a complex number. It returns "a" as a string
    in which the real and imaginary parts have digits significant digits.
    """
    re = to_precision.to_precision(a.real, digits)
    im = to_precision.to_precision(np.abs(a.imag), digits)
    if a.imag >= 0:
        return "{:s}+{:s}j".format(re, im)
    elif a.imag < 0:
        return "{:s}-{:s}j".format(re, im)


def numpy_to_matlab_sf(A, ndigits=2):
    """numpy_to_matlab(A, ndigits=2)

    This function assumes that A is one of these things:

        - a number (float or complex)
        - a 2D ndarray (float or complex)

    It returns A as a MATLAB-formatted string in which each number has
    ndigits significant digits.
    """
    if np.isscalar(A):
        if np.iscomplexobj(A):
            A_str = _string_from_complex_sigfig(A, ndigits)
        else:
            A_str = to_precision.to_precision(A, ndigits)
        return A_str
    elif A.ndim == 1:
        s = A.shape
        m = s[0]
        A_str = "["
        for i in range(0, m):
            if np.iscomplexobj(A[i]):
                A_str += _string_from_complex_sigfig(A[i], ndigits)
            else:
                A_str += to_precision.to_precision(A[i], ndigits)
            if i < m - 1:
                A_str += ", "
        A_str += "]"
        return A_str
    else:
        s = A.shape
        m = s[0]
        n = s[1]
        A_str = "["
        for i in range(0, m):
            for j in range(0, n):
                if np.iscomplexobj(A[i, j]):
                    A_str += _string_from_complex_sigfig(A[i, j], ndigits)
                else:
                    A_str += to_precision.to_precision(A[i, j], ndigits)
                if j == n - 1:
                    if i == m - 1:
                        A_str += "]"
                    else:
                        A_str += "; "
                else:
                    A_str += " "
        return A_str


def string_partition_first_interval(s, left="[", right="]"):
    # Split at first left delimiter
    (s_before_left, s_left, s) = s.partition(left)
    # Split at first right delimiter
    (s, s_right, s_after_right) = s.partition(right)
    # Return results
    return s_before_left, s, s_after_right


def string_partition_outer_interval(s, left="[", right="]"):
    # Split at first left delimiter
    (s_before_left, s_left, s) = s.partition(left)
    # Split at last right delimiter
    (s, s_right, s_after_right) = s.rpartition(right)
    # Return results
    return s_before_left, s, s_after_right


def string_to_integer(s: str, base: int = 10) -> int | None:
    """string_to_integer(s, base=10)

    Parses a string that is an integer.

    Returns a number with type int, or None on parse error.
    """
    if s is None:
        return None

    # Do unidecode before parsing
    s = full_unidecode(s).strip()

    # Try to parse as int
    try:
        s_int = int(s, base)
        return s_int
    except Exception:
        # If that didn't work, return None
        return None


def string_to_number(s, allow_complex=True):
    """string_to_number(s, allow_complex=True)

    Parses a string that can be interpreted either as float or (optionally) complex.

    Returns a number with type np.float64 or np.complex128, or None on parse error.
    """
    # Replace unicode minus with hyphen minus wherever it occurs
    s = s.replace("\u2212", "-")
    # If complex numbers are allowed...
    if allow_complex:
        # Replace "i" with "j" wherever it occurs
        s = s.replace("i", "j")
        # Strip white space on either side of "+" or "-" wherever they occur
        s = re.sub(r" *\+ *", "+", s)
        s = re.sub(r" *\- *", "-", s)
    # Try to parse as float
    try:
        s_float = float(s)
        return np.float64(s_float)
    except Exception:
        # If that didn't work, either pass (and try to parse as complex) or return None
        if allow_complex:
            pass
        else:
            return None
    # Try to parse as complex
    try:
        s_complex = complex(s)
        return np.complex128(s_complex)
    except Exception:
        # If that didn't work, return None
        return None


def string_fraction_to_number(a_sub, allow_fractions=True, allow_complex=True):
    """string_fraction_to_number(a_sub, allow_fractions=True, allow_complex=True)

    Parses a string containing a decimal number with support for answers expressing
    as a fraction.

    Returns a tuple with the parsed value in the first entry and a dictionary with
    the intended value of "data" in the second entry.

    On successful parsing, "data" will contain a 'submitted_answers' key that is the
    JSON encoded parsed answer.

    If parsing failed, the first entry will be 'None' and the "data" entry will
    contain a 'format_errors' key.
    """
    data = {}
    value = None

    if a_sub is None:
        data["format_errors"] = "No submitted answer."
        return (value, data)

    if a_sub.strip() == "":
        data["format_errors"] = "The submitted answer was blank."
        return (value, data)

    # support FANCY division characters
    a_sub = a_sub.replace("\u2215", "/")  # unicode /
    a_sub = a_sub.replace("\u00F7", "/")  # division symbol, because why not

    or_complex = " (or complex) " if allow_complex else " "

    if a_sub.count("/") == 1:
        # Specially handle fractions.

        if allow_fractions:
            a_sub_splt = a_sub.split("/")
            try:
                a_parse_l = string_to_number(a_sub_splt[0], allow_complex=allow_complex)
                a_parse_r = string_to_number(a_sub_splt[1], allow_complex=allow_complex)

                if a_parse_l is None or not np.isfinite(a_parse_l):
                    raise ValueError(
                        f"The numerator could not be interpreted as a decimal{ or_complex }number."
                    )
                if a_parse_r is None or not np.isfinite(a_parse_r):
                    raise ValueError(
                        f"The denominator could not be interpreted as a decimal{ or_complex }number."
                    )

                with np.errstate(divide="raise"):
                    a_frac = a_parse_l / a_parse_r
                if not np.isfinite(a_frac):
                    raise ValueError("The submitted answer is not a finite number.")

                value = a_frac
                data["submitted_answers"] = to_json(value)
            except FloatingPointError:  # Caused by numpy division
                data["format_errors"] = (
                    "Your expression resulted in a division by zero."
                )
            except Exception as error:
                data["format_errors"] = f"Invalid format: {str(error)}"
        else:
            data["format_errors"] = "Fractional answers are not allowed in this input."
    else:
        # Not a fraction, just convert to float or complex
        try:
            a_sub_parsed = string_to_number(a_sub, allow_complex=allow_complex)
            if a_sub_parsed is None:
                raise ValueError(
                    f"The submitted answer could not be interpreted as a decimal{ or_complex }number."
                )
            if not np.isfinite(a_sub_parsed):
                raise ValueError("The submitted answer is not a finite number.")
            value = a_sub_parsed
            data["submitted_answers"] = to_json(value)
        except Exception as error:
            data["format_errors"] = f"Invalid format: {str(error)}"

    return (value, data)


def string_to_2darray(s, allow_complex=True):
    """string_to_2darray(s)

    Parses a string that is either a scalar or a 2D array in matlab or python
    format. Each number must be interpretable as type float or complex.
    """
    # Replace unicode minus with hyphen minus wherever it occurs
    s = s.replace("\u2212", "-")
    # If complex numbers are allowed...
    if allow_complex:
        # Replace "i" with "j" wherever it occurs
        s = s.replace("i", "j")

    # Count left and right brackets and check that they are balanced
    number_of_left_brackets = s.count("[")
    number_of_right_brackets = s.count("]")
    if number_of_left_brackets != number_of_right_brackets:
        return (None, {"format_error": "Unbalanced square brackets."})

    # If there are no brackets, treat as scalar
    if number_of_left_brackets == 0:
        try:
            # Convert submitted answer (assumed to be a scalar) to float or (optionally) complex
            ans = string_to_number(s, allow_complex=allow_complex)
            if ans is None:
                raise ValueError("invalid submitted answer (wrong type)")
            if not np.isfinite(ans):
                raise ValueError("invalid submitted answer (not finite)")
            A = np.array([[ans]])
            # Return it with no error
            return (A, {"format_type": "python"})
        except Exception:
            # Return error if submitted answer could not be converted to float or complex
            if allow_complex:
                return (
                    None,
                    {
                        "format_error": "Invalid format (missing square brackets and could not be interpreted as a double-precision floating-point number or as a double-precision complex number)."
                    },
                )
            else:
                return (
                    None,
                    {
                        "format_error": "Invalid format (missing square brackets and could not be interpreted as a double-precision floating-point number)."
                    },
                )

    # Get string between outer brackets
    (s_before_left, s, s_after_right) = string_partition_outer_interval(s)

    # Return error if there is anything but space outside brackets
    s_before_left = s_before_left.strip()
    s_after_right = s_after_right.strip()
    if s_before_left:
        return (
            None,
            {
                "format_error": f"Non-empty text {escape_invalid_string(s_before_left)} before outer brackets."
            },
        )
    if s_after_right:
        return (
            None,
            {
                "format_error": f"Non-empty space {escape_invalid_string(s_after_right)} after outer brackets."
            },
        )

    # If there is only one set of brackets, treat as MATLAB format
    if number_of_left_brackets == 1:
        # Can NOT strip white space on either side of "+" or "-" wherever they occur,
        # because there is an ambiguity between space delimiters and whitespace.
        #
        #   Example:
        #       is '[1 - 2j]' the same as '[1 -2j]' or '[1-2j]'

        # Split on semicolon
        s = s.split(";")

        # Get number of rows
        m = len(s)

        # Return error if there are no rows (i.e., the matrix is empty)
        if m == 0:
            return (None, {"format_error": "The matrix has no rows."})

        # Regex to split rows a la MATLAB
        matlab_delimiter_regex = re.compile(r"\s*[\s,]\s*")

        # Get number of columns by splitting first row
        tokens = re.split(matlab_delimiter_regex, s[0])
        n = len(tokens)

        # Ignore first/last token if empty string (occurs when row leads/trails with valid delimiter)
        if n > 0 and not tokens[0]:
            n -= 1
        if n > 0 and not tokens[-1]:
            n -= 1

        # Return error if first row has no columns
        if n == 0:
            return (None, {"format_error": "Row 1 of the matrix has no columns."})

        # Define matrix in which to put result
        A = np.zeros((m, n))

        # Iterate over rows
        for i in range(0, m):
            # Split row
            s_row = re.split(matlab_delimiter_regex, s[i])

            # Ignore first/last token if empty string (occurs when row leads/trails with valid delimiter)
            if s_row and not s_row[0]:
                s_row.pop(0)
            if s_row and not s_row[-1]:
                s_row.pop(-1)

            # Return error if current row has more or less columns than first row
            if len(s_row) != n:
                return (
                    None,
                    {
                        "format_error": f"Rows 1 and {i + 1} of the matrix have a different number of columns."
                    },
                )

            # Iterate over columns
            for j in range(0, n):
                try:
                    # Convert entry to float or (optionally) complex
                    ans = string_to_number(s_row[j], allow_complex=allow_complex)
                    if ans is None:
                        raise ValueError("invalid submitted answer (wrong type)")

                    # Return error if entry is not finite
                    if not np.isfinite(ans):
                        raise ValueError("invalid submitted answer (not finite)")

                    # If the new entry is complex, convert the entire array in-place to np.complex128
                    if np.iscomplexobj(ans):
                        A = A.astype(np.complex128, copy=False)

                    # Insert the new entry
                    A[i, j] = ans
                except Exception:
                    # Return error if entry could not be converted to float or complex
                    return (
                        None,
                        {
                            "format_error": f"Entry {escape_invalid_string(s_row[j])} at location (row={i + 1}, column={j + 1}) in the matrix has an invalid format."
                        },
                    )

        # Return resulting ndarray with no error
        return (A, {"format_type": "matlab"})

    # If there is more than one set of brackets, treat as python format
    if number_of_left_brackets > 1:
        # Strip white space on either side of "+" or "-" wherever they occur
        s = re.sub(r" *\+ *", "+", s)
        s = re.sub(r" *\- *", "-", s)

        # Return error if there are any semicolons
        if ";" in s:
            return (
                None,
                {
                    "format_error": "Semicolons cannot be used as delimiters in an expression with nested brackets."
                },
            )

        # Partition string into rows
        s_row = []
        while s:
            # Get next row
            (
                s_before_left,
                s_between_left_and_right,
                s_after_right,
            ) = string_partition_first_interval(s)
            s_before_left = s_before_left.strip()
            s_after_right = s_after_right.strip()
            s_between_left_and_right = s_between_left_and_right.strip()
            s_row.append(s_between_left_and_right)

            # Return error if there is anything but space before left bracket
            if s_before_left:
                return (
                    None,
                    {
                        "format_error": f"Non-empty text {escape_invalid_string(s_before_left)} before the left bracket in row {len(s_row)} of the matrix."
                    },
                )

            # Return error if there are improperly nested brackets
            if ("[" in s_between_left_and_right) or ("]" in s_between_left_and_right):
                return (
                    None,
                    {
                        "format_error": f"Improperly nested brackets in row {len(s_row)} of the matrix."
                    },
                )

            # Check if we are in the last row
            if len(s_row) == number_of_left_brackets - 1:
                # Return error if it is the last row and there is anything but space after right bracket
                if s_after_right:
                    return (
                        None,
                        {
                            "format_error": f"Non-empty text {escape_invalid_string(s_after_right)} after the right bracket in row {len(s_row)} of the matrix."
                        },
                    )
                else:
                    s = s_after_right
            else:
                # Return error if it is not the last row and there is no comma after right bracket
                if s_after_right[0] != ",":
                    return (
                        None,
                        {
                            "format_error": f"No comma after row {len(s_row)} of the matrix."
                        },
                    )
                else:
                    s = s_after_right[1:]
        number_of_rows = len(s_row)

        # Check that number of rows is what we expected
        if number_of_rows != number_of_left_brackets - 1:
            raise Exception(
                f"Number of rows {number_of_rows} should have been one less than the number of brackets {number_of_left_brackets}"
            )

        # Split each row on comma
        number_of_columns = None
        for i in range(0, number_of_rows):
            # Return error if row has no columns
            if not s_row[i]:
                return (
                    None,
                    {"format_error": f"Row {i + 1} of the matrix has no columns."},
                )

            # Splitting on a comma always returns a list with at least one element
            s_row[i] = s_row[i].split(",")
            n = len(s_row[i])

            # Return error if row has different number of columns than first row
            if number_of_columns is None:
                number_of_columns = n
            elif number_of_columns != n:
                return (
                    None,
                    {
                        "format_error": f"Rows 1 and {i + 1} of the matrix have a different number of columns."
                    },
                )

        # Define matrix in which to put result
        A = np.zeros((number_of_rows, number_of_columns))

        # Parse each row and column
        for i in range(0, number_of_rows):
            for j in range(0, number_of_columns):
                try:
                    # Check if entry is empty
                    if not s_row[i][j].strip():
                        return (
                            None,
                            {
                                "format_error": f"Entry at location (row={i + 1}, column={j + 1}) in the matrix is empty."
                            },
                        )

                    # Convert entry to float or (optionally) complex
                    ans = string_to_number(s_row[i][j], allow_complex=allow_complex)
                    if ans is None:
                        raise ValueError("invalid submitted answer (wrong type)")

                    # Return error if entry is not finite
                    if not np.isfinite(ans):
                        raise ValueError("invalid submitted answer (not finite)")

                    # If the new entry is complex, convert the entire array in-place to np.complex128
                    if np.iscomplexobj(ans):
                        A = A.astype(np.complex128, copy=False)

                    # Insert the new entry
                    A[i, j] = ans
                except Exception:
                    # Return error if entry could not be converted to float or complex
                    return (
                        None,
                        {
                            "format_error": f"Entry {escape_invalid_string(s_row[i][j])} at location (row={i + 1}, column={j + 1}) of the matrix has an invalid format."
                        },
                    )

        # Return result with no error
        return (A, {"format_type": "python"})

    # Should never get here
    raise Exception(f"Invalid number of left brackets: {number_of_left_brackets}")


def latex_from_2darray(
    A: numbers.Number | np.ndarray,
    presentation_type: str = "f",
    digits: int = 2,
) -> str:
    r"""latex_from_2darray
    This function assumes that A is one of these things:
            - a number (float or complex)
            - a 2D ndarray (float or complex)

    If A is a scalar, the string is a single number, not wrapped in brackets.

    It A is a numpy 2D array, it returns a string with the format:
        '\begin{bmatrix} ... & ... \\ ... & ... \end{bmatrix}'

    If presentation_type is 'sigfig', each number is formatted using the
    to_precision module to "digits" significant figures.

    Otherwise, each number is formatted as '{:.{digits}{presentation_type}}'.
    """
    # if A is a scalar
    if isinstance(A, numbers.Number):
        if presentation_type == "sigfig":
            return string_from_number_sigfig(A, digits=digits)
        else:
            return "{:.{digits}{presentation_type}}".format(
                A, digits=digits, presentation_type=presentation_type
            )
    # Using Any annotation here because of weird Pyright-isms.
    if presentation_type == "sigfig":
        formatter: Any = {
            "float_kind": lambda x: to_precision.to_precision(x, digits),
            "complex_kind": lambda x: _string_from_complex_sigfig(x, digits),
        }
    else:
        formatter: Any = {
            "float_kind": lambda x: "{:.{digits}{presentation_type}}".format(
                x, digits=digits, presentation_type=presentation_type
            ),
            "complex_kind": lambda x: "{:.{digits}{presentation_type}}".format(
                x, digits=digits, presentation_type=presentation_type
            ),
        }

    if A.ndim != 2:
        raise ValueError("input should be a 2D numpy array")
    lines = (
        np.array2string(A, formatter=formatter)
        .replace("[", "")
        .replace("]", "")
        .splitlines()
    )
    rv = [r"\begin{bmatrix}"]
    rv.extend("  " + " & ".join(line.split()) + r"\\" for line in lines)
    rv.append(r"\end{bmatrix}")
    return "".join(rv)


def is_correct_ndarray2D_dd(a_sub, a_tru, digits=2):
    # Check if each element is correct
    m = a_sub.shape[0]
    n = a_sub.shape[1]
    for i in range(0, m):
        for j in range(0, n):
            if not is_correct_scalar_dd(a_sub[i, j], a_tru[i, j], digits):
                return False

    # All elements were close
    return True


def is_correct_ndarray2D_sf(a_sub, a_tru, digits=2):
    # Check if each element is correct
    m = a_sub.shape[0]
    n = a_sub.shape[1]
    for i in range(0, m):
        for j in range(0, n):
            if not is_correct_scalar_sf(a_sub[i, j], a_tru[i, j], digits):
                return False

    # All elements were close
    return True


def is_correct_ndarray2D_ra(a_sub, a_tru, rtol=1e-5, atol=1e-8):
    # Check if each element is correct
    return np.allclose(a_sub, a_tru, rtol, atol)


def is_correct_scalar_ra(
    a_sub: ArrayLike, a_tru: ArrayLike, rtol: float = 1e-5, atol: float = 1e-8
) -> bool:
    """Compare a_sub and a_tru using relative tolerance rtol and absolute tolerance atol."""
    return bool(np.allclose(a_sub, a_tru, rtol, atol))


def is_correct_scalar_dd(a_sub: ArrayLike, a_tru: ArrayLike, digits: int = 2) -> bool:
    """Compare a_sub and a_tru using digits many digits after the decimal place."""

    # If answers are complex, check real and imaginary parts separately
    if np.iscomplexobj(a_sub) or np.iscomplexobj(a_tru):
        real_comp = is_correct_scalar_dd(a_sub.real, a_tru.real, digits=digits)  # type: ignore
        imag_comp = is_correct_scalar_dd(a_sub.imag, a_tru.imag, digits=digits)  # type: ignore
        return real_comp and imag_comp

    # Get bounds on submitted answer
    eps = 0.51 * (10**-digits)
    lower_bound = a_tru - eps
    upper_bound = a_tru + eps

    # Check if submitted answer is in bounds
    return bool((a_sub > lower_bound) & (a_sub < upper_bound))


def is_correct_scalar_sf(a_sub: ArrayLike, a_tru: ArrayLike, digits: int = 2) -> bool:
    """Compare a_sub and a_tru using digits many significant figures."""

    # If answers are complex, check real and imaginary parts separately
    if np.iscomplexobj(a_sub) or np.iscomplexobj(a_tru):
        real_comp = is_correct_scalar_sf(a_sub.real, a_tru.real, digits=digits)  # type: ignore
        imag_comp = is_correct_scalar_sf(a_sub.imag, a_tru.imag, digits=digits)  # type: ignore
        return real_comp and imag_comp

    # Get bounds on submitted answer
    if a_tru == 0:
        n = digits - 1
    else:
        n = -int(np.floor(np.log10(np.abs(a_tru)))) + (digits - 1)
    eps = 0.51 * (10**-n)
    lower_bound = a_tru - eps
    upper_bound = a_tru + eps

    # Check if submitted answer is in bounds
    return bool((a_sub > lower_bound) & (a_sub < upper_bound))


def get_uuid() -> str:
    """
    Returns the string representation of a new random UUID.
    First character of this uuid is guaranteed to be an alpha
    (at the expense of a slight loss in randomness).

    This is done because certain web components need identifiers to
    start with letters and not numbers.
    """

    uuid_string = str(uuid.uuid4())
    random_char = random.choice("abcdef")

    return random_char + uuid_string[1:]


def escape_unicode_string(string: str) -> str:
    """
    escape_unicode_string(string)

    Combs through any string and replaces invisible/unprintable characters with a
    text representation of their hex id: <U+xxxx>

    A character is considered invisible if its category is "control" or "format", as
    reported by the 'unicodedata' library.

    More info on unicode categories:
    https://en.wikipedia.org/wiki/Unicode_character_property#General_Category
    """

    def escape_unprintable(x):
        category = unicodedata.category(x)
        if category == "Cc" or category == "Cf":
            return f"<U+{ord(x):x}>"
        else:
            return x

    return "".join(map(escape_unprintable, string))


def escape_invalid_string(string):
    """
    escape_invalid_string(string)

    Wraps and escapes string in <code> tags.
    """
    return f'<code class="user-output-invalid">{html.escape(escape_unicode_string(string))}</code>'


def clean_identifier_name(name):
    """
    clean_identifier_name(string)

    Escapes a string so that it becomes a valid Python identifier.
    """

    # Strip invalid characters and weird leading characters so we have
    # a decent python identifier
    name = re.sub("[^a-zA-Z0-9_]", "_", name)
    name = re.sub("^[^a-zA-Z]+", "", name)
    return name


def load_extension(data, extension_name):
    """
    load_extension(data, extension_name)

    Loads a single specific extension by name for an element.
    Returns a dictionary of defined variables and functions.
    """
    if "extensions" not in data:
        raise Exception("load_extension() must be called from an element!")
    if extension_name not in data["extensions"]:
        raise Exception(f"Could not find extension {extension_name}!")

    ext_info = data["extensions"][extension_name]
    if "controller" not in ext_info:
        # Nothing to load, just return an empty dict
        return {}

    # wrap extension functions so that they execute in their own directory
    def wrap(f):
        # If not a function, just return
        if not callable(f):
            return f

        def wrapped_function(*args, **kwargs):
            old_wd = os.getcwd()
            os.chdir(ext_info["directory"])
            ret_val = f(*args, **kwargs)
            os.chdir(old_wd)
            return ret_val

        return wrapped_function

    # Load any Python functions and variables from the defined controller
    script = os.path.join(ext_info["directory"], ext_info["controller"])
    loaded = {}
    spec = importlib.util.spec_from_file_location(f"{extension_name}-{script}", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    # Filter out extra names so we only get user defined functions and variables
    loaded = {
        f: wrap(module.__dict__[f])
        for f in module.__dict__.keys()
        if not f.startswith("__")
    }

    # Return functions and variables as a namedtuple, so we get the nice dot access syntax
    module_tuple = collections.namedtuple(
        clean_identifier_name(extension_name), loaded.keys()
    )
    return module_tuple(**loaded)


def load_all_extensions(data):
    """
    load_all_extensions(data)

    Loads all available extensions for a given element.
    Returns an ordered dictionary mapping the extension name to its defined variables and functions
    """

    if "extensions" not in data:
        raise Exception("load_all_extensions() must be called from an element!")
    if len(data["extensions"]) == 0:
        return {}

    loaded_extensions = collections.OrderedDict()
    for name in sorted(data["extensions"].keys()):
        loaded_extensions[name] = load_extension(data, name)

    return loaded_extensions


def load_host_script(script_name):
    """
    load_host_script(script_name)

    Small convenience function to load a host element script from an extension.
    """

    # Chop off the file extension because it's unnecessary here
    if script_name.endswith(".py"):
        script_name = script_name[:-3]
    return __import__(script_name)


def iter_keys() -> Generator[str, None, None]:
    """
    from:
    https://stackoverflow.com/questions/29351492/how-to-make-a-continuous-alphabetic-list-python-from-a-z-then-from-aa-ab-ac-e/29351603#29351603
    """
    ascii_set = string.ascii_lowercase

    return (
        "".join(s) for size in it.count(1) for s in it.product(ascii_set, repeat=size)
    )


def index2key(i: int) -> str:
    """
    index2key(i)

    Used when generating ordered lists of the form ['a', 'b', ..., 'z', 'aa', 'ab', ..., 'zz', 'aaa', 'aab', ...]

    Returns alphabetic key in the form [a-z]* from a given integer (i = 0, 1, 2, ...).
    """
    return next(it.islice(iter_keys(), i, None))


def is_int_json_serializable(n: int) -> bool:
    return -((2**53) - 1) <= n <= 2**53 - 1


def full_unidecode(input_str: str) -> str:
    """Does unidecode of input and replaces the unicode minus with the normal one."""
    return unidecode(input_str.replace("\u2212", "-"))
