import json
import math
from typing import Any, cast

import networkx as nx
import numpy as np
import pandas as pd
import pytest
from numpy.typing import ArrayLike
from prairielearn.conversion_utils import (
    from_json,
    latex_from_2darray,
    numpy_to_matlab_sf,
    string_from_number_sigfig,
    string_from_numpy,
    string_to_2darray,
    string_to_number,
    to_json,
)


def city_dataframe() -> pd.DataFrame:
    x = [
        {
            "city": "Champaign",
            "job": "Professor",
            "age": 35,
            "time": pd.to_datetime("2022-10-06 12:00"),
        },
        {
            "city": "Sunnyvale",
            "job": "Driver",
            "age": 20,
            "time": pd.to_datetime("2020-05-09 12:00"),
        },
        {
            "city": "Mountain View",
            "job": "Data Scientist",
            "age": np.nan,
            "time": pd.to_datetime("2021-12-14 12:00"),
        },
    ]
    return pd.DataFrame(x)


def breast_cancer_dataframe() -> pd.DataFrame:
    pd_dict = {
        0: {0: 842302, 1: 842517, 2: 84300903, 3: 84348301, 4: 84358402},
        1: {0: "M", 1: "M", 2: "M", 3: "M", 4: "M"},
        2: {0: 17.99, 1: 20.57, 2: 19.69, 3: 11.42, 4: 20.29},
        3: {0: 10.38, 1: 17.77, 2: 21.25, 3: 20.38, 4: 14.34},
        4: {0: 122.8, 1: 132.9, 2: 130.0, 3: 77.58, 4: 135.1},
        5: {0: 1001.0, 1: 1326.0, 2: 1203.0, 3: 386.1, 4: 1297.0},
        6: {0: 0.1184, 1: 0.08474, 2: 0.1096, 3: 0.1425, 4: 0.1003},
        7: {0: 0.2776, 1: 0.07864, 2: 0.1599, 3: 0.2839, 4: 0.1328},
        8: {0: 0.3001, 1: 0.0869, 2: 0.1974, 3: 0.2414, 4: 0.198},
        9: {0: 0.1471, 1: 0.07017, 2: 0.1279, 3: 0.1052, 4: 0.1043},
        10: {0: 0.2419, 1: 0.1812, 2: 0.2069, 3: 0.2597, 4: 0.1809},
        11: {0: 0.07871, 1: 0.05667, 2: 0.05999, 3: 0.09744, 4: 0.05883},
        12: {0: 1.095, 1: 0.5435, 2: 0.7456, 3: 0.4956, 4: 0.7572},
        13: {0: 0.9053, 1: 0.7339, 2: 0.7869, 3: 1.156, 4: 0.7813},
        14: {0: 8.589, 1: 3.398, 2: 4.585, 3: 3.445, 4: 5.438},
        15: {0: 153.4, 1: 74.08, 2: 94.03, 3: 27.23, 4: 94.44},
        16: {0: 0.006399, 1: 0.005225, 2: 0.00615, 3: 0.00911, 4: 0.01149},
        17: {0: 0.04904, 1: 0.01308, 2: 0.04006, 3: 0.07458, 4: 0.02461},
        18: {0: 0.05373, 1: 0.0186, 2: 0.03832, 3: 0.05661, 4: 0.05688},
        19: {0: 0.01587, 1: 0.0134, 2: 0.02058, 3: 0.01867, 4: 0.01885},
        20: {0: 0.03003, 1: 0.01389, 2: 0.0225, 3: 0.05963, 4: 0.01756},
        21: {0: 0.006193, 1: 0.003532, 2: 0.004571, 3: 0.009208, 4: 0.005115},
        22: {0: 25.38, 1: 24.99, 2: 23.57, 3: 14.91, 4: 22.54},
        23: {0: 17.33, 1: 23.41, 2: 25.53, 3: 26.5, 4: 16.67},
        24: {0: 184.6, 1: 158.8, 2: 152.5, 3: 98.87, 4: 152.2},
        25: {0: 2019.0, 1: 1956.0, 2: 1709.0, 3: 567.7, 4: 1575.0},
        26: {0: 0.1622, 1: 0.1238, 2: 0.1444, 3: 0.2098, 4: 0.1374},
        27: {0: 0.6656, 1: 0.1866, 2: 0.4245, 3: 0.8663, 4: 0.205},
        28: {0: 0.7119, 1: 0.2416, 2: 0.4504, 3: 0.6869, 4: 0.4},
        29: {0: 0.2654, 1: 0.186, 2: 0.243, 3: 0.2575, 4: 0.1625},
        30: {0: 0.4601, 1: 0.275, 2: 0.3613, 3: 0.6638, 4: 0.2364},
        31: {0: 0.1189, 1: 0.08902, 2: 0.08758, 3: 0.173, 4: 0.07678},
    }

    return pd.DataFrame.from_dict(pd_dict)


def r_types_dataframe() -> pd.DataFrame:
    return pd.DataFrame({
        # Scalars
        "integer": 1,
        "numeric": math.pi,
        "logical": False,
        "character": "foo",
        # TODO adding in complex numbers won't deserialize correctly, fix this (somehow?)
        # "complex": complex(1, 2),
        # Series
        "numeric-list": pd.Series([1.0] * 3, dtype="float64"),
        "integer-list": pd.Series([1] * 3, dtype="int64"),
        # "complex-list": pd.Series(np.array([1, 2, 3]) + np.array([4, 5, 6]) *1j).astype("complex128"),
        "character-list": pd.Series(["hello", "world", "stat"]),
        "logical-list": pd.Series([True, False, True]),
        "character-string-list": pd.Series(["a", "b", "c"]),
        # Time Dependency: https://pandas.pydata.org/docs/user_guide/timeseries.html
        "POSIXct-POSIXt-timestamp": pd.Timestamp("2023-01-02T00:00:00.0000000"),
        "POSIXct-POSIXt-date_range": pd.date_range("2023", freq="D", periods=3),
    })


@pytest.mark.parametrize(
    "df",
    [city_dataframe(), breast_cancer_dataframe(), r_types_dataframe()],
)
def test_encoding_pandas(df: pd.DataFrame) -> None:
    """Test that new json encoding works"""

    # Test encoding as json doesn't throw exceptions
    json_df = to_json(df, df_encoding_version=2)
    json_str = json.dumps(json_df)

    assert isinstance(json_str, str)

    # Deserialize and check equality
    loaded_str = json.loads(json_str)
    deserialized_df = cast(pd.DataFrame, from_json(loaded_str))

    # Column types get erased, need to account for this in testing
    reference_df = df.copy()
    reference_df.columns = reference_df.columns.astype("string").astype("object")

    pd.testing.assert_frame_equal(deserialized_df, reference_df)


@pytest.mark.parametrize(
    "df",
    [city_dataframe(), breast_cancer_dataframe(), r_types_dataframe()],
)
def test_encoding_legacy(df: pd.DataFrame) -> None:
    """Add compatibility test for legacy encoding"""
    reserialized_dataframe = cast(pd.DataFrame, from_json(to_json(df)))
    pd.testing.assert_frame_equal(df, reserialized_dataframe)


@pytest.mark.parametrize(
    "networkx_graph",
    [
        nx.cycle_graph(20),
        nx.ladder_graph(20),
        nx.lollipop_graph(20, 20),
        nx.gn_graph(20),
        nx.gnc_graph(20),
    ],
)
def test_networkx_serialization(
    networkx_graph: nx.Graph | nx.DiGraph | nx.MultiGraph | nx.MultiDiGraph,
) -> None:
    """Test equality after conversion of various numpy objects."""

    networkx_graph.graph["rankdir"] = "TB"

    # Add some data to test that it's retained
    for i, (_in_node, _out_node, edge_data) in enumerate(
        networkx_graph.edges(data=True)
    ):
        edge_data["weight"] = i
        edge_data["label"] = chr(ord("a") + i)

    json_object = json.dumps(to_json(networkx_graph), allow_nan=False)
    decoded_json_object = from_json(json.loads(json_object))

    assert type(decoded_json_object) is type(networkx_graph)

    # This check is needed because pyright cannot infer the type of decoded_json_object
    assert isinstance(decoded_json_object, type(networkx_graph))

    assert nx.utils.nodes_equal(networkx_graph.nodes(), decoded_json_object.nodes())
    assert nx.utils.edges_equal(networkx_graph.edges(), decoded_json_object.edges())


@pytest.mark.parametrize(
    "numpy_object",
    [
        np.int64(5),
        np.int32(-12),
        np.uint8(55),
        np.byte(3),
        np.float64(-1100204.04010340),
        np.float32(2.1100044587483),
        np.float16(0.00000184388328),
        np.int64((2**53) + 5),
        np.complex64("12+3j"),
        np.complex128("12+3j"),
        np.arange(15),
        np.array([1.2, 3.5, 5.1]),
        np.array([1, 2, 3, 4]),
        np.array([(1.5, 2, 3), (4, 5, 6)]),
        np.array([[1, 2], [3, 4]], dtype=complex),
        np.array([[1, "stuff"], [3, None]], dtype=object),
        np.ones((2, 3, 4), dtype=np.int16),
    ],
)
def test_numpy_serialization(numpy_object: ArrayLike) -> None:
    """Test equality after conversion of various numpy objects."""

    json_object = json.dumps(
        to_json(numpy_object, np_encoding_version=2), allow_nan=False
    )
    decoded_json_object = from_json(json.loads(json_object))

    assert type(numpy_object) is type(decoded_json_object)

    # This check is needed because pyright cannot infer the type of decoded_json_object
    assert isinstance(decoded_json_object, type(numpy_object))

    np.testing.assert_array_equal(numpy_object, decoded_json_object, strict=True)


@pytest.mark.parametrize(
    ("object_to_encode", "expected_result"),
    [(np.float64(5.0), 5.0), (np.complex128("12+3j"), complex("12+3j"))],
)
def test_legacy_serialization(object_to_encode: Any, expected_result: Any) -> None:
    """Test that nothing happens under the old encoding for numpy scalars."""

    json_object = json.dumps(to_json(object_to_encode), allow_nan=False)
    decoded_json_object = from_json(json.loads(json_object))

    assert decoded_json_object == expected_result


@pytest.mark.parametrize(
    ("value", "args", "expected_output"),
    [
        (0, {}, "0.00"),
        (0, {"digits": 1}, "0.0"),
        (0, {"digits": 0}, "0"),
        (0.0, {}, "0.00"),
        (0.0, {"digits": 1}, "0.0"),
        (0.0, {"digits": 0}, "0"),
        (np.float64(0.0), {}, "0.00"),
        (np.float64(0.0), {"digits": 1}, "0.0"),
        (np.float64(0.0), {"presentation_type": "sigfig"}, "0.0"),
        (np.zeros(2), {}, "[0.00, 0.00]"),
        (np.zeros(2), {"digits": 1}, "[0.0, 0.0]"),
        (np.zeros(2), {"digits": 0}, "[0, 0]"),
        (np.zeros(2), {"language": "matlab"}, "[0.00, 0.00]"),
        (np.zeros(2), {"language": "mathematica"}, "{0.00, 0.00}"),
        (np.zeros(2), {"language": "r"}, "c(0.00, 0.00)"),
        (np.zeros(2), {"language": "sympy"}, "Matrix([0.00, 0.00])"),
        (np.zeros((2, 2)), {}, "[[0.00, 0.00], [0.00, 0.00]]"),
        (np.zeros((2, 2)), {"digits": 1}, "[[0.0, 0.0], [0.0, 0.0]]"),
        (np.zeros((2, 2)), {"digits": 0}, "[[0, 0], [0, 0]]"),
        (np.zeros((2, 2)), {"language": "matlab"}, "[0.00 0.00; 0.00 0.00]"),
        (np.zeros((2, 2)), {"language": "mathematica"}, "{{0.00, 0.00}, {0.00, 0.00}}"),
        (
            np.zeros((2, 2)),
            {"language": "r"},
            "matrix(c(0.00, 0.00, 0.00, 0.00), nrow = 2, ncol = 2, byrow = TRUE)",
        ),
        (
            np.zeros((2, 2)),
            {"language": "sympy"},
            "Matrix([[0.00, 0.00], [0.00, 0.00]])",
        ),
    ],
)
def test_string_from_numpy(value: Any, args: dict, expected_output: str) -> None:
    assert string_from_numpy(value, **args) == expected_output


@pytest.mark.parametrize(
    ("value", "args", "expected_output"),
    [
        (0, {}, "0.0"),
        (0, {"digits": 1}, "0."),
        (0, {"digits": 0}, "0"),
        (0.0, {}, "0.0"),
        (0.0, {"digits": 1}, "0."),
        (0.0, {"digits": 0}, "0"),
        (complex(1, 2), {}, "1.0+2.0j"),
        (complex(0, 2), {}, "0.0+2.0j"),
        (complex(1, 0), {}, "1.0+0.0j"),
        (np.complex64(complex(1, 2)), {}, "1.0+2.0j"),
        (np.complex64(complex(0, 2)), {}, "0.0+2.0j"),
        (np.complex64(complex(1, 0)), {}, "1.0+0.0j"),
        # For legacy reasons, we must also support strings.
        ("0", {}, "0.0"),
        ("0", {"digits": 1}, "0."),
        ("0", {"digits": 0}, "0"),
    ],
)
def test_string_from_number_sigfig(
    value: Any, args: dict, expected_output: str
) -> None:
    assert string_from_number_sigfig(value, **args) == expected_output


@pytest.mark.parametrize(
    ("value", "args", "expected_output"),
    [
        (0, {}, "0.0"),
        (0, {"ndigits": 1}, "0."),
        (0, {"ndigits": 0}, "0"),
        (0.0, {}, "0.0"),
        (0.0, {"ndigits": 1}, "0."),
        (0.0, {"ndigits": 0}, "0"),
        (complex(1, 2), {}, "1.0+2.0j"),
        (complex(0, 2), {}, "0.0+2.0j"),
        (complex(1, 0), {}, "1.0+0.0j"),
        (np.complex64(complex(1, 2)), {}, "1.0+2.0j"),
        (np.complex64(complex(0, 2)), {}, "0.0+2.0j"),
        (np.complex64(complex(1, 0)), {}, "1.0+0.0j"),
    ],
)
def test_numpy_to_matlab_sf(value: Any, args: dict, expected_output: str) -> None:
    assert numpy_to_matlab_sf(value, **args) == expected_output


@pytest.mark.parametrize(
    ("value", "expected_output"),
    [
        (0, "0.00"),
        (0.0, "0.00"),
        (complex(1, 2), "1.00+2.00j"),
        (np.array([[1, 2], [3, 4]]), r"\begin{bmatrix}  1 & 2\\  3 & 4\\\end{bmatrix}"),
    ],
)
def test_latex_from_2darray(value: Any, expected_output: str) -> None:
    assert latex_from_2darray(value) == expected_output


@pytest.mark.parametrize(
    ("text", "allow_complex", "expected_matrix", "expected_format"),
    [
        # Scalar inputs
        ("5", True, np.array([[5.0]]), "python"),
        ("5.3", True, np.array([[5.3]]), "python"),
        ("-5.3", True, np.array([[-5.3]]), "python"),
        ("1+2j", True, np.array([[1 + 2j]]), "python"),
        ("1-2j", True, np.array([[1 - 2j]]), "python"),
        # MATLAB format
        ("[1 2 3]", True, np.array([[1.0, 2.0, 3.0]]), "matlab"),
        ("[1, 2, 3]", True, np.array([[1.0, 2.0, 3.0]]), "matlab"),
        ("[1 2; 3 4]", True, np.array([[1.0, 2.0], [3.0, 4.0]]), "matlab"),
        ("[1+2j 3-4j]", True, np.array([[1 + 2j, 3 - 4j]]), "matlab"),
        ("[1+2j, 3-4j]", True, np.array([[1 + 2j, 3 - 4j]]), "matlab"),
        # Python format
        ("[[1, 2], [3, 4]]", True, np.array([[1.0, 2.0], [3.0, 4.0]]), "python"),
        (
            "[[1+2j, 3-4j], [5+6j, 7-8j]]",
            True,
            np.array([[1 + 2j, 3 - 4j], [5 + 6j, 7 - 8j]]),
            "python",
        ),
        # Edge cases
        ("0", True, np.array([[0.0]]), "python"),
        ("[0]", True, np.array([[0.0]]), "matlab"),
        ("[[0]]", True, np.array([[0.0]]), "python"),
        # Complex numbers disabled
        ("5", False, np.array([[5.0]]), "python"),
        ("[1 2]", False, np.array([[1.0, 2.0]]), "matlab"),
        ("[[1, 2]]", False, np.array([[1.0, 2.0]]), "python"),
    ],
)
def test_string_to_2darray_valid(
    *,
    text: str,
    allow_complex: bool,
    expected_matrix: np.ndarray[Any, Any],
    expected_format: str,
) -> None:
    matrix, format_data = string_to_2darray(text, allow_complex=allow_complex)
    assert matrix is not None
    assert np.allclose(matrix, expected_matrix)
    assert format_data.get("format_type") == expected_format


@pytest.mark.parametrize(
    ("text", "allow_complex", "expected_error"),
    [
        # Invalid format
        ("a", True, "invalid format"),
        ("[a b]", True, "invalid format"),
        ("[[a, b]]", True, "invalid format"),
        # Complex numbers disabled
        ("1+2j", False, "invalid format"),
        ("[1+2j]", False, "invalid format"),
        ("[[1+2j]]", False, "invalid format"),
        # Unbalanced brackets
        ("[1, 2", True, "unbalanced square brackets"),
        ("[[1, 2]", True, "unbalanced square brackets"),
        ("[1, 2]]", True, "unbalanced square brackets"),
        # Inconsistent dimensions
        (
            "[1 2; 3]",
            True,
            "rows 1 and 2 of the matrix have a different number of columns",
        ),
        (
            "[[1,2], [3]]",
            True,
            "rows 1 and 2 of the matrix have a different number of columns",
        ),
        # Invalid delimiters
        ("[[1; 2]]", True, "semicolons cannot be used as delimiters"),
        ("[1..2]", True, "invalid format"),
        # Empty matrices
        ("[]", True, "row 1 of the matrix has no columns"),
        ("[[]]", True, "row 1 of the matrix has no columns"),
    ],
)
def test_string_to_2darray_invalid(
    *, text: str, allow_complex: bool, expected_error: str
) -> None:
    matrix, format_data = string_to_2darray(text, allow_complex=allow_complex)
    assert matrix is None
    assert "format_error" in format_data
    assert expected_error in format_data["format_error"].lower()


@pytest.mark.parametrize(
    ("text", "allow_complex", "expected_result"),
    [
        # Basic integer/float inputs
        ("0", True, np.float64(0.0)),
        ("1", True, np.float64(1.0)),
        ("-1", True, np.float64(-1.0)),
        ("1.0", True, np.float64(1.0)),
        ("-1.0", True, np.float64(-1.0)),
        ("1e0", True, np.float64(1.0)),
        ("1e1", True, np.float64(10.0)),
        ("1e-1", True, np.float64(0.1)),
        ("-1e-1", True, np.float64(-0.1)),
        # Complex numbers with various formats
        ("1+1j", True, np.complex128(1 + 1j)),
        ("1-1j", True, np.complex128(1 - 1j)),
        ("1+i", True, np.complex128(1 + 1j)),
        ("1-i", True, np.complex128(1 - 1j)),
        ("i", True, np.complex128(1j)),
        ("j", True, np.complex128(1j)),
        ("-i", True, np.complex128(-1j)),
        ("2.5+3.6j", True, np.complex128(2.5 + 3.6j)),
        # Unicode minus sign
        ("\u22121.0", True, np.float64(-1.0)),
        ("1\u2212i", True, np.complex128(1 - 1j)),
        # Without complex numbers allowed
        ("1", False, np.float64(1.0)),
        ("1.0", False, np.float64(1.0)),
        ("-1.0", False, np.float64(-1.0)),
        ("1e0", False, np.float64(1.0)),
        # Invalid inputs should return None
        ("", True, None),
        ("abc", True, None),
        ("1++1", True, None),
        ("1+-1", True, None),
        ("1+2+3j", True, None),
        ("1+", True, None),
        # Complex inputs should return None when complex not allowed
        ("1+1j", False, None),
        ("1+i", False, None),
        ("i", False, None),
    ],
)
def test_string_to_number(
    *,
    text: str,
    allow_complex: bool,
    expected_result: np.float64 | np.complex128 | None,
) -> None:
    """Test the string_to_number function with various inputs."""
    result = string_to_number(text, allow_complex=allow_complex)

    if expected_result is None:
        assert result is None
    else:
        assert result is not None
        assert type(result) is type(expected_result)
        assert np.allclose(result, expected_result)
