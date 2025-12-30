"""Utilities for converting and serializing between different data formats.

```python
from prairielearn import ...
```
"""

import json
import numbers
import re
from io import StringIO
from typing import TYPE_CHECKING, Any, Literal, TypedDict, cast, overload

import networkx as nx
import numpy as np
import numpy.typing as npt
import pandas as pd
import sympy
from typing_extensions import assert_never

from prairielearn.html_utils import escape_invalid_string
from prairielearn.misc_utils import full_unidecode
from prairielearn.sympy_utils import (
    convert_string_to_sympy,
    is_sympy_json,
    json_to_sympy,
    sympy_to_json,
)
from prairielearn.to_precision import to_precision

if TYPE_CHECKING:
    from numpy.core.arrayprint import _FormatDict


class _JSONSerializedGeneric(TypedDict):
    _type: Literal[
        "sympy",
        "sympy_matrix",
        "dataframe",
        "dataframe_v2",
        "networkx_graph",
        "complex",
        "ndarray",
        "np_scalar",
        "complex_ndarray",
    ]
    _value: Any


class _JSONSerializedNumpyScalar(_JSONSerializedGeneric):
    _concrete_type: str


class _JSONSerializedNdarray(_JSONSerializedGeneric, total=False):
    _dtype: str


class _JSONSerializedComplexNdarray(_JSONSerializedGeneric, total=False):
    _dtype: str


class _JSONSerializedSympyMatrix(_JSONSerializedGeneric):
    _variables: list[str]
    _shape: tuple[int, int]


# This represents the output object formats for the to_json function
_JSONSerializedType = (
    _JSONSerializedGeneric
    | _JSONSerializedNumpyScalar
    | _JSONSerializedNdarray
    | _JSONSerializedComplexNdarray
    | _JSONSerializedSympyMatrix
)

_JSONPythonType = (
    np.complex64
    | np.complex128
    | np.number[Any]
    | npt.NDArray[Any]
    | sympy.Expr
    | sympy.Matrix
    | sympy.ImmutableMatrix
    | pd.DataFrame
    | nx.Graph
    | nx.DiGraph
    | nx.MultiGraph
    | nx.MultiDiGraph
)
"""
This represents additional object formats (i.e. non-standard Python types)
that can be serialized / deserialized.
"""


def is_int_json_serializable(n: int) -> bool:
    """Check if an integer is less than `Number.MAX_SAFE_INTEGER` and greater than `Number.MIN_SAFE_INTEGER`.

    See <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER>.

    Returns:
        `True` if it can be serialized by JS code.
    """
    return -((2**53) - 1) <= n <= 2**53 - 1


@overload
def to_json(
    v: _JSONPythonType,
    *,
    df_encoding_version: Literal[1, 2] = 1,
    np_encoding_version: Literal[1, 2] = 1,
) -> _JSONSerializedType: ...


@overload
def to_json(
    v: Any,
    *,
    df_encoding_version: Literal[1, 2] = 1,
    np_encoding_version: Literal[1, 2] = 1,
) -> Any: ...


def to_json(
    v: Any | _JSONPythonType,
    *,
    df_encoding_version: Literal[1, 2] = 1,
    np_encoding_version: Literal[1, 2] = 1,
) -> Any | _JSONSerializedType:
    """
    Convert a value to a JSON serializable format.

    If v has a standard type that cannot be json serialized, it is replaced with
    a `{'_type': ..., '_value': ...}` pair that can be json serialized.

    This is a complete table of the mappings:

    | Type | JSON `_type` field | notes |
    | --- | --- | --- |
    | complex scalar | `complex` | including numpy |
    | non-complex ndarray | `ndarray` | assumes each element can be json serialized |
    | complex ndarray | `complex_ndarray` | |
    | `sympy.Expr` | `sympy` | any scalar SymPy expression |
    | `sympy.Matrix` | `sympy_matrix` | |
    | `pandas.DataFrame` | `dataframe` | `df_encoding_version=1` |
    | `pandas.DataFrame` | `dataframe_v2` | `df_encoding_version=2` |
    | networkx graph type | `networkx_graph` |
    | numpy scalar | `np_scalar` | `np_encoding_version=2` |
    | any | `v` | if v can be json serialized |

    !!! note
        The `'dataframe_v2'` encoding allows for missing and date time values whereas
        the `'dataframe'` (default) does not. However, the `'dataframe'` encoding allows for complex
        numbers while `'dataframe_v2'` does not.

    If `np_encoding_version` is set to 2, then numpy scalars serialize using `'_type': 'np_scalar'`.

    If `df_encoding_version` is set to 2, then pandas DataFrames serialize using `'_type': 'dataframe_v2'`.

    See [from_json][prairielearn.conversion_utils.from_json] for details about the differences between encodings.

    If v is an ndarray, this function preserves its dtype (by adding `'_dtype'` as
    a third field in the dictionary).

    If v can be JSON serialized or does not have a standard type, then it is
    returned without change.

    Returns:
        The serialized value

    Raises:
        ValueError: If `np_encoding_version` or `df_encoding_version` is invalid.
    """
    if np_encoding_version not in {1, 2}:
        raise ValueError(f"Invalid np_encoding {np_encoding_version}, must be 1 or 2.")

    if np_encoding_version == 2 and isinstance(v, np.number):
        return {
            "_type": "np_scalar",
            "_concrete_type": type(v).__name__,
            "_value": str(v),
        }

    if np.isscalar(v) and np.iscomplexobj(v):  # pyright:ignore[reportArgumentType]
        return {"_type": "complex", "_value": {"real": v.real, "imag": v.imag}}  # pyright:ignore[reportAttributeAccessIssue]
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
        return sympy_to_json(v)
    elif isinstance(v, (sympy.Matrix, sympy.ImmutableMatrix)):
        s = [str(a) for a in v.free_symbols]
        num_rows, num_cols = v.shape
        matrix = []
        for i in range(num_rows):
            row = [str(v[i, j]) for j in range(num_cols)]
            matrix.append(row)
        return {
            "_type": "sympy_matrix",
            "_value": matrix,
            "_variables": s,
            "_shape": [num_rows, num_cols],
        }
    elif isinstance(v, pd.DataFrame):
        if df_encoding_version == 1:
            return {
                "_type": "dataframe",
                "_value": {
                    "index": list(v.index),
                    "columns": list(v.columns),
                    "data": v.to_numpy().tolist(),
                },
            }

        elif df_encoding_version == 2:
            # The next lines of code are required to address the JSON table-orient
            # generating numeric keys instead of strings for an index sequence with
            # only numeric values (c.f. pandas-dev/pandas#46392)
            df_modified_names = v.copy()

            if df_modified_names.columns.dtype in (np.float64, np.int64):  # type: ignore
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


def _has_value_fields(v: _JSONSerializedType, fields: list[str]) -> bool:
    """Return True if all fields in the '_value' dictionary are present."""
    return (
        "_value" in v
        and isinstance(v["_value"], dict)
        and all(field in v["_value"] for field in fields)
    )


def from_json(v: _JSONSerializedType | Any) -> Any:
    """
    Converts a JSON serialized value (from [`to_json`][prairielearn.conversion_utils.to_json]) back to its original type.

    If v has the format `{'_type': ..., '_value': ...}` as would have been created
    using `to_json(...)`, then it is replaced according to the following table:

    | JSON `_type` field | Python type |
    | --- | --- |
    | `complex` | `complex` |
    | `np_scalar` | numpy scalar defined by `_concrete_type` |
    | `ndarray` | non-complex `ndarray` |
    | `complex_ndarray` | complex `ndarray` |
    | `sympy` | `sympy.Expr` |
    | `sympy_matrix` | `sympy.Matrix` |
    | `dataframe` | `pandas.DataFrame` |
    | `dataframe_v2` | `pandas.DataFrame` |
    | `networkx_graph` | corresponding networkx graph |
    | missing | input value v returned |

    If v encodes an ndarray and has the field `'_dtype'`, this function recovers
    its dtype.

    If v does not have the format `{'_type': ..., '_value': ...}`, then it is
    returned without change.

    Returns:
        The deserialized value

    Raises:
        ValueError: If the JSON object is not in the expected format.
    """
    if isinstance(v, dict) and "_type" in v:
        v_json = cast(_JSONSerializedType, v)
        if v_json["_type"] == "complex":
            if _has_value_fields(v_json, ["real", "imag"]):
                return complex(v_json["_value"]["real"], v_json["_value"]["imag"])
            else:
                raise ValueError(
                    "variable of type complex should have value with real and imaginary pair"
                )
        elif v_json["_type"] == "np_scalar":
            if "_concrete_type" in v_json and "_value" in v_json:
                return getattr(np, v_json["_concrete_type"])(v_json["_value"])
            else:
                raise ValueError(
                    f"variable of type {v_json['_type']} needs both concrete type and value information"
                )
        elif v_json["_type"] == "ndarray":
            if "_value" in v_json:
                if "_dtype" in v_json:
                    return np.array(v_json["_value"]).astype(v_json["_dtype"])
                else:
                    return np.array(v_json["_value"])
            else:
                raise ValueError("variable of type ndarray should have value")
        elif v_json["_type"] == "complex_ndarray":
            if _has_value_fields(v_json, ["real", "imag"]):
                if "_dtype" in v_json:
                    return (
                        np.array(v_json["_value"]["real"])
                        + np.array(v_json["_value"]["imag"]) * 1j
                    ).astype(v_json["_dtype"])
                else:
                    return (
                        np.array(v_json["_value"]["real"])
                        + np.array(v_json["_value"]["imag"]) * 1j
                    )
            else:
                raise ValueError(
                    "variable of type complex_ndarray should have value with real and imaginary pair"
                )
        elif v_json["_type"] == "sympy":
            if not is_sympy_json(v_json):
                raise ValueError(
                    "variable claiming to be of type sympy doesn't pass typechecks"
                )
            return json_to_sympy(v_json)
        elif v_json["_type"] == "sympy_matrix":
            if (
                ("_value" in v_json)
                and ("_variables" in v_json)
                and ("_shape" in v_json)
            ):
                value = v_json["_value"]
                variables = v_json["_variables"]
                shape = v_json["_shape"]
                matrix = sympy.Matrix.zeros(shape[0], shape[1])
                for i in range(shape[0]):
                    for j in range(shape[1]):
                        matrix[i, j] = convert_string_to_sympy(value[i][j], variables)
                return matrix
            else:
                raise ValueError(
                    "variable of type sympy_matrix should have value, variables, and shape"
                )
        elif v_json["_type"] == "dataframe":
            if _has_value_fields(v_json, ["index", "columns", "data"]):
                val = v_json["_value"]
                return pd.DataFrame(
                    index=val["index"], columns=val["columns"], data=val["data"]
                )
            else:
                raise ValueError(
                    "variable of type dataframe should have value with index, columns, and data"
                )
        elif v_json["_type"] == "dataframe_v2":
            # Convert native JSON back to a string representation so that
            # pandas read_json() can process it.
            value_str = StringIO(json.dumps(v_json["_value"]))
            return pd.read_json(value_str, orient="table")
        elif v_json["_type"] == "networkx_graph":
            return nx.adjacency_graph(v_json["_value"])
        else:
            raise ValueError("variable has unknown type {}".format(v_json["_type"]))
    return v


_NumericScalarType = numbers.Number | complex | np.generic


def numpy_to_matlab(
    np_object: _NumericScalarType | npt.NDArray[Any],
    ndigits: int = 2,
    wtype: str = "f",
    style: Literal["legacy", "space", "comma"] = "legacy",
) -> str:
    """Converts np_object to a MATLAB-formatted string in which each number has "ndigits" digits
    after the decimal and is formatted as "wtype" (e.g., 'f', 'g', etc.).

    This function assumes that np_object is one of these things:

    - a number (float or complex)
    - a 2D ndarray (float or complex)

    The style argument must be one of three values:

    - legacy: formats 1D arrays with commas and 2D arrays with spaces
    - comma: formats all arrays with commas
    - space: formats all arrays with spaces

    Returns:
        A MATLAB-formatted string
    """
    if np.isscalar(np_object):
        scalar_str = "{:.{indigits}{iwtype}}".format(
            np_object, indigits=ndigits, iwtype=wtype
        )
        return scalar_str

    assert isinstance(np_object, np.ndarray)

    sep_1d = ", " if style in ["comma", "legacy"] else " "
    sep_2d = ", " if style == "comma" else " "
    if np_object.ndim == 1:
        s = np_object.shape
        m = s[0]
        vector_str = "["
        for i in range(m):
            vector_str += "{:.{indigits}{iwtype}}".format(
                np_object[i], indigits=ndigits, iwtype=wtype
            )
            if i < m - 1:
                vector_str += sep_1d
        vector_str += "]"
        return vector_str
    else:
        s = np_object.shape
        m = s[0]
        n = s[1]
        matrix_str = "["
        for i in range(m):
            for j in range(n):
                matrix_str += "{:.{indigits}{iwtype}}".format(
                    np_object[i, j], indigits=ndigits, iwtype=wtype
                )
                if j == n - 1:
                    if i == m - 1:
                        matrix_str += "]"
                    else:
                        matrix_str += "; "
                else:
                    matrix_str += sep_2d
        return matrix_str


_FormatLanguage = Literal["python", "matlab", "mathematica", "r", "sympy"]


def string_from_numpy(
    A: _NumericScalarType | npt.NDArray[Any],
    language: _FormatLanguage = "python",
    presentation_type: str = "f",
    digits: int = 2,
) -> str:
    """
    Return A as a string.

    This function assumes that A is one of these things:

    - a number (float or complex)
    - a 1D ndarray (float or complex)
    - a 2D ndarray (float or complex)

    If language is 'python' and A is a 2D ndarray, the string looks like this:

        [[ ..., ... ], [ ..., ... ]]

    If A is a 1D ndarray, the string looks like this:

        [ ..., ..., ... ]

    If language is `'matlab'` and A is a 2D ndarray, the string looks like this:

        [ ... ... ; ... ... ]

    If A is a 1D ndarray, the string looks like this:

        [ ..., ..., ... ]

    If language is `'mathematica'` and A is a 2D ndarray, the string looks like this:

        {{ ..., ... },{ ..., ... }}

    If A is a 1D ndarray, the string looks like this:

        { ..., ..., ... }

    If language is `'r'` and A is a 2D ndarray, the string looks like this:

        matrix(c(., ., .), nrow=NUM_ROWS, ncol=NUM_COLS, byrow = TRUE)

    If A is a 1D ndarray, the string looks like this:

        c(., ., .)

    If language is `'sympy'` and A is a 2D ndarray, the string looks like this:

        Matrix([[ ..., ... ], [ ..., ... ]])

    If A is a 1D ndarray, the string looks like this:

        Matrix([ ..., ..., ... ])

    In either case, if A is not a 1D or 2D ndarray, the string is a single number,
    not wrapped in brackets.

    If presentation_type is `'sigfig'`, each number is formatted using the
    to_precision module to `'digits'` significant figures.

    Otherwise, each number is formatted as `'{:.{digits}{presentation_type}}'`.

    Returns:
        A formatted version of the NumPy array.

    Raises:
        TypeError: If A is not a scalar or a numpy array.

    Examples:
        >>> string_from_numpy(np.zeros((2, 2)), language="mathematica")
        "{{0.00, 0.00}, {0.00, 0.00}}"
        >>> string_from_numpy(np.zeros((2, 2)), language="r")
        "matrix(c(0.00, 0.00, 0.00, 0.00), nrow = 2, ncol = 2, byrow = TRUE)"
        >>> string_from_numpy(np.zeros((2, 2)), language="sympy")
        "Matrix([[0.00, 0.00], [0.00, 0.00]])"
    """
    # if A is a scalar
    if np.isscalar(A):
        assert not isinstance(A, (memoryview, str, bytes))
        if presentation_type == "sigfig":
            return string_from_number_sigfig(A, digits=digits)
        else:
            return "{:.{digits}{presentation_type}}".format(
                A, digits=digits, presentation_type=presentation_type
            )

    if not isinstance(A, np.ndarray):
        raise TypeError("A must be a numpy array or scalar")

    if presentation_type == "sigfig":
        formatter: _FormatDict = {
            "float_kind": lambda x: to_precision(x, digits),
            "complex_kind": lambda x: _string_from_complex_sigfig(x, digits),
        }
    else:
        formatter: _FormatDict = {
            "float_kind": lambda x: "{:.{digits}{presentation_type}}".format(
                x, digits=digits, presentation_type=presentation_type
            ),
            "complex_kind": lambda x: "{:.{digits}{presentation_type}}".format(
                x, digits=digits, presentation_type=presentation_type
            ),
        }

    # if A is a 1D or 2D ndarray
    if language == "python":
        return np.array2string(A, formatter=formatter, separator=", ").replace("\n", "")
    elif language == "matlab":
        if presentation_type == "sigfig":
            return numpy_to_matlab_sf(A, ndigits=digits)
        else:
            return numpy_to_matlab(A, ndigits=digits, wtype=presentation_type)
    elif language == "mathematica":
        result = np.array2string(A, formatter=formatter, separator=", ").replace(
            "\n", ""
        )
        result = result.replace("[", "{")
        result = result.replace("]", "}")
        return result
    elif language == "r":
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
        result = np.array2string(A, formatter=formatter, separator=", ").replace(
            "\n", ""
        )
        # Cast to a vector: Matrix([1, 2, 3, 4, 5, 6])
        result = f"Matrix({result})"
        return result
    else:
        assert_never(language)


# Deprecated version, keeping for backwards compatibility
def string_from_2darray(  # noqa: D103
    A: npt.NDArray[Any],
    language: _FormatLanguage = "python",
    presentation_type: str = "f",
    digits: int = 2,
) -> str:
    result = string_from_numpy(A, language, presentation_type, digits)
    return result


def string_from_number_sigfig(a: _NumericScalarType | str, digits: int = 2) -> str:
    """Convert a number to a string with the specified significant digits.

    This function assumes that `a` is of type float or complex.

    Returns:
        `a` as a string in which the number, or both the real and imaginary parts of the
    number, have digits significant digits.
    """
    assert np.isscalar(a)
    assert not isinstance(a, (memoryview, bytes))

    if np.iscomplexobj(a):
        # `np.iscomplexobj` isn't a proper type guard, so we need to use
        # casting to call this function.
        return _string_from_complex_sigfig(cast(complex, a), digits=digits)
    else:
        return to_precision(a, digits)


def _string_from_complex_sigfig(
    a: complex | np.complex64 | np.complex128, digits: int = 2
) -> str:
    """Convert a complex number to a string.

    This function assumes that `a` is a complex number.

    Returns:
        `a` as a string in which the real and imaginary parts have digits significant digits.
    """
    re = to_precision(a.real, digits)
    im = to_precision(np.abs(a.imag), digits)
    if a.imag >= 0:
        return f"{re}+{im}j"
    else:
        return f"{re}-{im}j"


def numpy_to_matlab_sf(
    A: _NumericScalarType | npt.NDArray[Any],
    ndigits: int = 2,
    style: Literal["legacy", "comma", "space"] = "legacy",
) -> str:
    """
    Convert A to a MATLAB-formatted string in which each number has
    ndigits significant digits.

    This function assumes that A is one of these things:

    - a number (float or complex)
    - a 2D ndarray (float or complex)

    The style argument must be one of three values:

    - legacy: formats 1d arrays with commas and 2d arrays with spaces
    - comma: formats all arrays with commas
    - space: formats all arrays with spaces

    Returns:
        A as a MATLAB-formatted string

    Examples:
        >>> numpy_to_matlab_sf(np.array([[1 + 2j, 3 + 4j], [5 + 6j, 7 + 8j]]), style="space")
        [1.0+2.0j 3.0+4.0j; 5.0+6.0j 7.0+8.0j]
    """
    if np.isscalar(A):
        assert not isinstance(A, (memoryview, str, bytes))
        if np.iscomplexobj(A):
            # `np.iscomplexobj` isn't a proper type guard, so we need to use
            # casting to call this function
            scalar_str = _string_from_complex_sigfig(cast(complex, A), ndigits)
        else:
            scalar_str = to_precision(A, ndigits)
        return scalar_str
    assert isinstance(A, np.ndarray)
    sep_1d = ", " if style in ["comma", "legacy"] else " "
    sep_2d = ", " if style == "comma" else " "
    if A.ndim == 1:
        s = A.shape
        m = s[0]
        vector_str = "["
        for i in range(m):
            if np.iscomplexobj(A[i]):
                vector_str += _string_from_complex_sigfig(A[i], ndigits)
            else:
                vector_str += to_precision(A[i], ndigits)
            if i < m - 1:
                vector_str += sep_1d
        vector_str += "]"
        return vector_str
    else:
        s = A.shape
        m = s[0]
        n = s[1]
        matrix_str = "["
        for i in range(m):
            for j in range(n):
                if np.iscomplexobj(A[i, j]):
                    matrix_str += _string_from_complex_sigfig(A[i, j], ndigits)
                else:
                    matrix_str += to_precision(A[i, j], ndigits)
                if j == n - 1:
                    if i == m - 1:
                        matrix_str += "]"
                    else:
                        matrix_str += "; "
                else:
                    matrix_str += sep_2d
        return matrix_str


def string_to_integer(s: str, base: int = 10) -> int | None:
    """Parse a string that is an integer.

    Returns:
        An integer or `None` on parse error.
    """
    if not isinstance(s, str):
        return None

    # Do unidecode before parsing
    s = full_unidecode(s).strip()

    # Try to parse as int
    try:
        s_int = int(s, base)
        return s_int
    except ValueError:
        # If that didn't work, return None
        return None


def string_to_number(
    s: str, *, allow_complex: bool = True
) -> np.float64 | np.complex128 | None:
    """
    Parse a string that can be interpreted either as float or (optionally) complex.

    Returns:
        A number with type `np.float64` or `np.complex128`, or `None` on parse error.
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


class _PartialDataFormatErrors(TypedDict):
    format_errors: str


class _PartialDataSubmittedAnswers(TypedDict):
    submitted_answers: Any


def string_fraction_to_number(
    a_sub: str | None,
    allow_fractions: bool = True,  # noqa: FBT001, FBT002
    allow_complex: bool = True,  # noqa: FBT001, FBT002
) -> (
    tuple[None, _PartialDataFormatErrors]
    | tuple[np.float64 | np.complex128, _PartialDataSubmittedAnswers]
):
    """Parse a string containing a decimal number with support for answers expressing
    as a fraction.

    On successful parsing, "data" will contain a 'submitted_answers' key that is the
    JSON encoded parsed answer.

    If parsing failed, the first entry will be 'None' and the "data" entry will
    contain a 'format_errors' key.

    Returns:
        A tuple with the parsed value in the first entry and a dictionary with the intended value of "data" in the second entry.

    Examples:
        >>> string_fraction_to_number("1/2", allow_fractions=False, allow_complex=False)
        (None, {"format_errors": "Fractional answers are not allowed in this input."})
        >>> string_fraction_to_number("1/2", allow_fractions=True, allow_complex=False)
        (0.5, {"submitted_answers": 0.5})
    """  # noqa: DOC501 (false positive)
    data: _PartialDataSubmittedAnswers = {}  # type: ignore
    value: np.float64 | np.complex128 = None  # type: ignore

    if a_sub is None:
        return (None, {"format_errors": "No submitted answer."})

    if a_sub.strip() == "":
        return (None, {"format_errors": "The submitted answer was blank."})

    # support FANCY division characters
    a_sub = a_sub.replace("\u2215", "/")  # unicode /
    a_sub = a_sub.replace("\u00f7", "/")  # division symbol, because why not

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
                        f"The numerator could not be interpreted as a decimal{or_complex}number."
                    )
                if a_parse_r is None or not np.isfinite(a_parse_r):
                    raise ValueError(
                        f"The denominator could not be interpreted as a decimal{or_complex}number."
                    )

                with np.errstate(divide="raise"):
                    a_frac = a_parse_l / a_parse_r
                if not np.isfinite(a_frac):
                    raise ValueError("The submitted answer is not a finite number.")

                value = a_frac
                data["submitted_answers"] = to_json(value)
            except FloatingPointError:  # Caused by numpy division
                return (
                    None,
                    {
                        "format_errors": "Your expression resulted in a division by zero."
                    },
                )
            except Exception as exc:
                return (
                    None,
                    {"format_errors": f"Invalid format: {exc}"},
                )
        else:
            return (
                None,
                {"format_errors": "Fractional answers are not allowed in this input."},
            )
    else:
        # Not a fraction, just convert to float or complex
        try:
            a_sub_parsed = string_to_number(a_sub, allow_complex=allow_complex)
            if a_sub_parsed is None:
                raise ValueError(
                    f"The submitted answer could not be interpreted as a decimal{or_complex}number."
                )
            if not np.isfinite(a_sub_parsed):
                raise ValueError("The submitted answer is not a finite number.")
            value = a_sub_parsed
            data["submitted_answers"] = to_json(value)
        except Exception as exc:
            return (
                None,
                {"format_errors": f"Invalid format: {exc}"},
            )

    return (value, data)


def latex_from_2darray(
    A: _NumericScalarType | npt.NDArray[Any],
    presentation_type: str = "f",
    digits: int = 2,
) -> str:
    r"""Convert a NumPy array to LaTeX.

    This function assumes that A is one of these things:

    - a number (float or complex)
    - a 2D ndarray (float or complex)

    If A is a scalar, the string is a single number, not wrapped in brackets.

    It A is a numpy 2D array, it returns a string with the format:

    ```
    \begin{bmatrix} ... & ... \\ ... & ... \end{bmatrix}
    ```

    If presentation_type is `'sigfig'`, each number is formatted using the
    to_precision module to `'digits'` significant figures.

    Otherwise, each number is formatted as `'{:.{digits}{presentation_type}}'`.

    Returns:
        The input formatted in LaTeX.

    Raises:
        TypeError: If A is not a numpy array or scalar.
        ValueError: If A is not a 2D numpy array.

    Examples:
        >>> latex_from_2darray(np.array([[1, 2], [3, 4]]))
        \begin{bmatrix}  1 & 2\\  3 & 4\\\end{bmatrix}
    """
    # if A is a scalar
    if np.isscalar(A):
        assert not isinstance(A, memoryview | str | bytes)
        if presentation_type == "sigfig":
            return string_from_number_sigfig(A, digits=digits)
        else:
            return "{:.{digits}{presentation_type}}".format(
                A, digits=digits, presentation_type=presentation_type
            )

    if not isinstance(A, np.ndarray):
        raise TypeError("A must be a numpy array or scalar")

    # Using Any annotation here because of weird Pyright-isms.
    if presentation_type == "sigfig":
        formatter: Any = {
            "float_kind": lambda x: to_precision(x, digits),
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


def string_partition_first_interval(
    s: str, left: str = "[", right: str = "]"
) -> tuple[str, str, str]:
    """Split a string at the first occurrence of left and right delimiters."""
    # Split at first left delimiter
    (s_before_left, _, s) = s.partition(left)
    # Split at first right delimiter
    (s, _, s_after_right) = s.partition(right)
    # Return results
    return s_before_left, s, s_after_right


def string_partition_outer_interval(
    s: str, left: str = "[", right: str = "]"
) -> tuple[str, str, str]:
    """Split a string at the first left delimiter and last right delimiter."""
    # Split at first left delimiter
    (s_before_left, _, s) = s.partition(left)
    # Split at last right delimiter
    (s, _, s_after_right) = s.rpartition(right)
    # Return results
    return s_before_left, s, s_after_right


def string_to_2darray(
    s: str, *, allow_complex: bool = True
) -> tuple[npt.NDArray[Any] | None, dict[str, str]]:
    """
    Parse a string that is either a scalar or a 2D array in matlab or python
    format. Each number must be interpretable as type float or complex.

    Returns:
        A 2-element tuple with the value, and any errors.

    Raises:
        ValueError: If the input isn't the right type or is infinite.
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
    result_type: Literal["python", "matlab", "scalar"]
    if number_of_left_brackets == 0:
        # If there are no brackets, treat as scalar
        result_type = "scalar"
    elif number_of_left_brackets == 1:
        # If there is only one set of brackets, treat as MATLAB format
        result_type = "matlab"
    else:
        # If there is more than one set of brackets, treat as python format
        result_type = "python"

    # Get string between outer brackets
    if result_type != "scalar":
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

    if result_type == "scalar":
        try:
            # Convert submitted answer (assumed to be a scalar) to float or (optionally) complex
            ans = string_to_number(s, allow_complex=allow_complex)
            if ans is None:
                raise ValueError("invalid submitted answer (wrong type)")
            if not np.isfinite(ans):
                raise ValueError("invalid submitted answer (not finite)")
            matrix = np.array([[ans]])
            # Return it with no error
            return (matrix, {"format_type": "python"})
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
    elif result_type == "matlab":
        # Can NOT strip white space on either side of "+" or "-" wherever they occur,
        # because there is an ambiguity between space delimiters and whitespace.
        #
        #   Example:
        #       is '[1 - 2j]' the same as '[1 -2j]' or '[1-2j]'

        # Split on semicolon
        s_list = s.split(";")

        # Get number of rows
        m = len(s_list)

        # Return error if there are no rows (i.e., the matrix is empty)
        if m == 0:
            return (None, {"format_error": "The matrix has no rows."})

        # Regex to split rows a la MATLAB
        matlab_delimiter_regex = re.compile(r"\s*[\s,]\s*")

        # Get number of columns by splitting first row
        tokens = re.split(matlab_delimiter_regex, s_list[0])
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
        matrix = np.zeros((m, n))

        # Iterate over rows
        for i in range(m):
            # Split row
            s_row = re.split(matlab_delimiter_regex, s_list[i])

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
            j = 0
            try:
                for j in range(n):
                    # Convert entry to float or (optionally) complex
                    ans = string_to_number(s_row[j], allow_complex=allow_complex)
                    if ans is None:
                        raise ValueError("invalid submitted answer (wrong type)")

                    # Return error if entry is not finite
                    if not np.isfinite(ans):
                        raise ValueError("invalid submitted answer (not finite)")

                    # If the new entry is complex, convert the entire array in-place to np.complex128
                    if np.iscomplexobj(ans):
                        matrix = matrix.astype(np.complex128, copy=False)

                    # Insert the new entry
                    matrix[i, j] = ans
            except Exception:
                # Return error if entry could not be converted to float or complex
                return (
                    None,
                    {
                        "format_error": f"Entry {escape_invalid_string(s_row[j])} at location (row={i + 1}, column={j + 1}) in the matrix has an invalid format."
                    },
                )

        # Return resulting ndarray with no error
        return (matrix, {"format_type": "matlab"})
    elif result_type == "python":
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
            # Return error if it is not the last row and there is no comma after right bracket
            elif s_after_right[0] != ",":
                return (
                    None,
                    {"format_error": f"No comma after row {len(s_row)} of the matrix."},
                )
            else:
                s = s_after_right[1:]
        number_of_rows = len(s_row)

        # Check that number of rows is what we expected
        if number_of_rows != number_of_left_brackets - 1:
            raise ValueError(
                f"Number of rows {number_of_rows} should have been one less than the number of brackets {number_of_left_brackets}"
            )

        # Split each row on comma
        number_of_columns = None
        for i in range(number_of_rows):
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

        if number_of_columns is None:
            return (None, {"format_error": "The matrix has no columns."})
        # Define matrix in which to put result
        matrix = np.zeros((number_of_rows, number_of_columns))

        # Parse each row and column
        i, j = 0, 0
        try:
            for i in range(number_of_rows):
                for j in range(number_of_columns):
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
                        matrix = matrix.astype(np.complex128, copy=False)

                    # Insert the new entry
                    matrix[i, j] = ans
        except Exception:
            # Return error if entry could not be converted to float or complex
            return (
                None,
                {
                    "format_error": f"Entry {escape_invalid_string(s_row[i][j])} at location (row={i + 1}, column={j + 1}) of the matrix has an invalid format."
                },
            )

        # Return result with no error
        return (matrix, {"format_type": "python"})
    assert_never(result_type)
