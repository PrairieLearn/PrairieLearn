import base64
import itertools as it
import json
import math
import string
from collections.abc import Callable
from enum import Enum
from pathlib import Path
from typing import Any, cast

import lxml.html
import networkx as nx
import numpy as np
import pandas as pd
import prairielearn as pl
import pytest
from numpy.typing import ArrayLike


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
        "numeric": 3.15,
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
    """Test that new JSON encoding works"""
    # Test encoding as json doesn't throw exceptions
    json_df = pl.to_json(df, df_encoding_version=2)
    json_str = json.dumps(json_df)

    assert isinstance(json_str, str)

    # Deserialize and check equality
    loaded_str = json.loads(json_str)
    deserialized_df = cast(pd.DataFrame, pl.from_json(loaded_str))

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
    reserialized_dataframe = cast(pd.DataFrame, pl.from_json(pl.to_json(df)))
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

    json_object = json.dumps(pl.to_json(networkx_graph), allow_nan=False)
    decoded_json_object = pl.from_json(json.loads(json_object))

    assert type(decoded_json_object) is type(networkx_graph)

    # This check is needed because pyright cannot infer the type of decoded_json_object
    assert isinstance(decoded_json_object, type(networkx_graph))

    assert nx.utils.nodes_equal(networkx_graph.nodes(), decoded_json_object.nodes())
    assert nx.utils.edges_equal(networkx_graph.edges(), decoded_json_object.edges())


@pytest.mark.parametrize(
    "inner_html_string",
    [
        "test",
        "test&gt;test",
        "some loose text <pl>other <b>bold</b> text</pl>"
        "some <p> other <b>words</b> are </p> here",
        '<p>Some flavor text.</p> <pl-thing some-attribute="4">answers</pl-thing>',
    ],
)
def test_inner_html(inner_html_string: str) -> None:
    e = lxml.html.fragment_fromstring(f"<div>{inner_html_string}</div>")
    assert pl.inner_html(e) == inner_html_string


@pytest.mark.parametrize(
    ("weight_set_function", "score_1", "score_2", "score_3", "expected_score"),
    [
        # Check set weighted score data
        (pl.set_weighted_score_data, 0.0, 0.0, 0.0, 0.0),
        (pl.set_weighted_score_data, 0.0, 0.5, 0.0, 2.0 / 7.0),
        (pl.set_weighted_score_data, 0.0, 0.75, 1.0, 4.0 / 7.0),
        (pl.set_weighted_score_data, 0.5, 0.75, 1.0, 5.0 / 7.0),
        (pl.set_weighted_score_data, 1.0, 1.0, 1.0, 1.0),
        # Check all or nothing weighted score data
        (pl.set_all_or_nothing_score_data, 0.0, 0.0, 0.0, 0.0),
        (pl.set_all_or_nothing_score_data, 0.5, 0.0, 1, 0.0),
        (pl.set_all_or_nothing_score_data, 0.5, 0.75, 1.0, 0.0),
        (pl.set_all_or_nothing_score_data, 1.0, 1.0, 1.0, 1.0),
    ],
)
def test_set_score_data(
    question_data: pl.QuestionData,
    weight_set_function: Callable[[pl.QuestionData], None],
    score_1: float,
    score_2: float,
    score_3: float,
    expected_score: float,
) -> None:
    question_data["partial_scores"] = {
        "p1": {"score": score_1, "weight": 2},
        "p2": {"score": score_2, "weight": 4},
        "p3": {"score": score_3},  # No weight tests default behavior
    }

    # Assert equality
    weight_set_function(question_data)
    assert math.isclose(question_data["score"], expected_score)


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
        pl.to_json(numpy_object, np_encoding_version=2), allow_nan=False
    )
    decoded_json_object = pl.from_json(json.loads(json_object))

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
    json_object = json.dumps(pl.to_json(object_to_encode), allow_nan=False)
    decoded_json_object = pl.from_json(json.loads(json_object))

    assert decoded_json_object == expected_result


class DummyEnum(Enum):
    DEFAULT = 0
    DUMMY_CHOICE_1 = 1
    DUMMY_CHOICE_2 = 2
    DUMMY_CHOICE_3 = 3


@pytest.mark.parametrize(
    ("html_str", "expected_result", "default"),
    [
        ("<pl-thing></pl-thing>", DummyEnum.DEFAULT, DummyEnum.DEFAULT),
        (
            '<pl-thing test-choice="default"></pl-thing>',
            DummyEnum.DEFAULT,
            DummyEnum.DEFAULT,
        ),
        ('<pl-thing test-choice="default"></pl-thing>', DummyEnum.DEFAULT, None),
        (
            '<pl-thing test-choice="dummy-choice-1"></pl-thing>',
            DummyEnum.DUMMY_CHOICE_1,
            DummyEnum.DEFAULT,
        ),
        (
            '<pl-thing test-choice="dummy-choice-2"></pl-thing>',
            DummyEnum.DUMMY_CHOICE_2,
            DummyEnum.DEFAULT,
        ),
        (
            '<pl-thing test-choice="dummy-choice-3"></pl-thing>',
            DummyEnum.DUMMY_CHOICE_3,
            DummyEnum.DEFAULT,
        ),
    ],
)
def test_get_enum_attrib(
    *, html_str: str, expected_result: DummyEnum, default: DummyEnum | None
) -> None:
    element = lxml.html.fragment_fromstring(html_str)
    result = pl.get_enum_attrib(element, "test-choice", DummyEnum, default)

    assert result is expected_result


@pytest.mark.parametrize(
    "html_str",
    [
        "<pl-thing></pl-thing>",
        '<pl-thing test-choice="DEFAULT"></pl-thing>',
        '<pl-thing test-choice="Default"></pl-thing>',
        '<pl-thing test-choice="dummy_choice_1"></pl-thing>',
    ],
)
def test_get_enum_attrib_exceptions(html_str: str) -> None:
    element = lxml.html.fragment_fromstring(html_str)

    with pytest.raises(ValueError):  # noqa: PT011
        pl.get_enum_attrib(element, "test-choice", DummyEnum)


@pytest.mark.parametrize(
    ("question_name", "student_answer", "weight", "expected_grade"),
    [
        ("base", "a", 1, True),
        ("base", "a, b", 1, False),
        ("base", "", 2, False),
        ("home", "b", 2, True),
        ("base", "c", 3, True),
        ("base", "<>", 3, True),
        ("base", "><", 3, False),
    ],
)
def test_grade_answer_parametrized_correct(
    question_data: pl.QuestionData,
    question_name: str,
    student_answer: str,
    weight: int,
    expected_grade: bool,  # noqa: FBT001
) -> None:
    question_data["submitted_answers"] = {question_name: student_answer}

    good_feedback = "you did good"
    bad_feedback = "that's terrible"

    def grading_function(submitted_answer: str) -> tuple[bool, str | None]:
        if submitted_answer in {"a", "b", "c", "d", "<>"}:
            return True, good_feedback
        return False, bad_feedback

    pl.grade_answer_parameterized(
        question_data, question_name, grading_function, weight
    )

    expected_score = 1.0 if expected_grade else 0.0
    assert question_data["partial_scores"][question_name]["score"] == expected_score
    assert isinstance(question_data["partial_scores"][question_name]["score"], float)

    assert "weight" in question_data["partial_scores"][question_name]
    assert question_data["partial_scores"][question_name].get("weight") == weight

    expected_feedback = good_feedback if expected_grade else bad_feedback

    assert (
        question_data["partial_scores"][question_name].get("feedback")
        == expected_feedback
    )


def test_grade_answer_parametrized_bad_grade_function(
    question_data: pl.QuestionData,
) -> None:
    question_name = "name"

    question_data["submitted_answers"] = {question_name: "True"}

    def grading_function(ans: str) -> Any:
        return "True", f"The answer {ans} is right"

    with pytest.raises(AssertionError):
        pl.grade_answer_parameterized(question_data, question_name, grading_function)


def test_grade_answer_parametrized_key_error_blank(
    question_data: pl.QuestionData,
) -> None:
    question_name = "name"

    question_data["submitted_answers"] = {question_name: "True"}

    def grading_function(_: str) -> tuple[bool, str | None]:
        decoy_dict: dict[str, str] = {}
        decoy_dict["junk"]  # This is to throw a key error
        return (True, None)

    with pytest.raises(KeyError):
        pl.grade_answer_parameterized(question_data, question_name, grading_function)

    # Empty out submitted answers
    question_data["submitted_answers"] = {}
    question_data["format_errors"] = {}
    pl.grade_answer_parameterized(question_data, question_name, grading_function)

    assert question_data["partial_scores"][question_name]["score"] == 0.0


@pytest.mark.repeat(100)
def test_get_uuid() -> None:
    """Test basic properties of the pl.get_uuid() function."""
    pl_uuid = pl.get_uuid()
    clauses = pl_uuid.split("-")

    # Assert clauses have standard structure.
    assert len(clauses) == 5
    assert list(map(len, clauses)) == [8, 4, 4, 4, 12]

    # Assert that all characters are valid.
    seen_characters = set().union(*(clause for clause in clauses))
    allowed_hex_characters = set(string.hexdigits[:16])
    assert seen_characters.issubset(allowed_hex_characters)

    # Assert that the first character is a valid hex letter.
    assert pl_uuid[0] in set("abcdef")


@pytest.mark.parametrize(
    ("length", "expected_output"),
    [
        (1, ["a"]),
        (2, ["a", "b"]),
        (4, ["a", "b", "c", "d"]),
    ],
)
def test_iter_keys(length: int, expected_output: list[str]) -> None:
    assert list(it.islice(pl.iter_keys(), length)) == expected_output


@pytest.mark.parametrize(
    ("idx", "expected_output"),
    [(0, "a"), (1, "b"), (3, "d"), (26, "aa"), (27, "ab")],
)
def test_index2key(idx: int, expected_output: str) -> None:
    assert pl.index2key(idx) == expected_output


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
    assert pl.string_from_numpy(value, **args) == expected_output


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
        (np.complex64(complex(0, -2)), {}, "0.0-2.0j"),
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
    assert pl.string_from_number_sigfig(value, **args) == expected_output


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
        # 1D arrays
        (np.array([1, 2, 3]), {"style": "legacy"}, "[1.0, 2.0, 3.0]"),
        (np.array([1, 2, 3]), {"style": "space"}, "[1.0 2.0 3.0]"),
        (np.array([1, 2, 3]), {"style": "comma"}, "[1.0, 2.0, 3.0]"),
        (np.array([1.5, 2.5]), {}, "[1.5, 2.5]"),
        (np.array([1 + 2j, 3 + 4j]), {}, "[1.0+2.0j, 3.0+4.0j]"),
        # 2D arrays
        (np.array([[1, 2], [3, 4]]), {}, "[1.0 2.0; 3.0 4.0]"),
        (np.array([[1, 2], [3, 4]]), {"style": "space"}, "[1.0 2.0; 3.0 4.0]"),
        (np.array([[1, 2], [3, 4]]), {"style": "comma"}, "[1.0, 2.0; 3.0, 4.0]"),
        (np.array([[1.5, 2.5], [3.5, 4.5]]), {}, "[1.5 2.5; 3.5 4.5]"),
        (
            np.array([[1 + 2j, 3 + 4j], [5 + 6j, 7 + 8j]]),
            {},
            "[1.0+2.0j 3.0+4.0j; 5.0+6.0j 7.0+8.0j]",
        ),
    ],
)
def test_numpy_to_matlab_sf(
    value: Any, args: dict[str, Any], expected_output: str
) -> None:
    assert pl.numpy_to_matlab_sf(value, **args) == expected_output


@pytest.mark.parametrize(
    ("value", "args", "expected_output"),
    [
        (0.0123, {}, "0.01"),
    ],
)
def test_numpy_to_matlab(
    value: Any, args: dict[str, Any], expected_output: str
) -> None:
    assert pl.numpy_to_matlab(value, **args) == expected_output


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
    assert pl.latex_from_2darray(value) == expected_output


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
    matrix, format_data = pl.string_to_2darray(text, allow_complex=allow_complex)
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
    matrix, format_data = pl.string_to_2darray(text, allow_complex=allow_complex)
    assert matrix is None
    assert "format_error" in format_data
    assert expected_error in format_data["format_error"].lower()


@pytest.mark.parametrize(
    ("score", "expected_key", "expected_value"),
    [
        # Full credit
        (1.0, "correct", True),
        (1.5, "correct", True),
        # Zero credit
        (0.0, "incorrect", True),
        (-1.0, "incorrect", True),
        # Partial credit
        (0.75, "partial", 75),
        (0.1, "partial", 10),
        (0.99, "partial", 99),
        (0.001, "partial", 0),  # Tests floor rounding
    ],
)
def test_determine_score_params(
    *, score: float, expected_key: str, expected_value: bool | float
) -> None:
    """Test score parameter determination for frontend display."""
    key, value = pl.determine_score_params(score)
    assert key == expected_key
    assert value == expected_value


@pytest.mark.parametrize(
    ("html_str", "expected_result", "default"),
    [
        # Standard boolean values
        ('<pl-thing bool-val="true"></pl-thing>', True, None),
        ('<pl-thing bool-val="false"></pl-thing>', False, None),
        ('<pl-thing bool-val="True"></pl-thing>', True, None),
        ('<pl-thing bool-val="False"></pl-thing>', False, None),
        ('<pl-thing bool-val="TRUE"></pl-thing>', True, None),
        ('<pl-thing bool-val="FALSE"></pl-thing>', False, None),
        # Numeric values
        ('<pl-thing bool-val="1"></pl-thing>', True, None),
        ('<pl-thing bool-val="0"></pl-thing>', False, None),
        # Yes/no values
        ('<pl-thing bool-val="yes"></pl-thing>', True, None),
        ('<pl-thing bool-val="no"></pl-thing>', False, None),
        ('<pl-thing bool-val="Yes"></pl-thing>', True, None),
        ('<pl-thing bool-val="No"></pl-thing>', False, None),
        ('<pl-thing bool-val="YES"></pl-thing>', True, None),
        ('<pl-thing bool-val="NO"></pl-thing>', False, None),
        # Single letter values
        ('<pl-thing bool-val="t"></pl-thing>', True, None),
        ('<pl-thing bool-val="f"></pl-thing>', False, None),
        ('<pl-thing bool-val="T"></pl-thing>', True, None),
        ('<pl-thing bool-val="F"></pl-thing>', False, None),
        ('<pl-thing bool-val="y"></pl-thing>', True, None),
        ('<pl-thing bool-val="n"></pl-thing>', False, None),
        ('<pl-thing bool-val="Y"></pl-thing>', True, None),
        ('<pl-thing bool-val="N"></pl-thing>', False, None),
        # Default value cases
        ("<pl-thing></pl-thing>", True, True),
        ("<pl-thing></pl-thing>", False, False),
        ("<pl-thing></pl-thing>", None, None),
    ],
)
def test_get_boolean_attrib(
    *, html_str: str, expected_result: bool | None, default: bool | None
) -> None:
    """Test boolean attribute parsing with various formats and defaults."""
    element = lxml.html.fragment_fromstring(html_str)
    if default is None:
        # Test without default value, should get attribute value or raise ValueError
        if "bool-val" in element.attrib:
            result = pl.get_boolean_attrib(element, "bool-val")
            assert result == expected_result
        else:
            with pytest.raises(ValueError, match="missing and no default is available"):
                pl.get_boolean_attrib(element, "bool-val")
    else:
        # Test with default value
        result = pl.get_boolean_attrib(element, "bool-val", default)
        assert result == expected_result


@pytest.mark.parametrize(
    "html_str",
    [
        '<pl-thing bool-val="invalid"></pl-thing>',
        '<pl-thing bool-val="2"></pl-thing>',
        '<pl-thing bool-val="maybe"></pl-thing>',
        '<pl-thing bool-val=""></pl-thing>',
    ],
)
def test_get_boolean_attrib_invalid(html_str: str) -> None:
    """Test that invalid boolean values raise ValueError."""
    element = lxml.html.fragment_fromstring(html_str)
    with pytest.raises(ValueError, match="must be a boolean value"):
        pl.get_boolean_attrib(element, "bool-val")


@pytest.mark.parametrize(
    ("html_str", "expected_result"),
    [
        ('<pl-thing checked="true"></pl-thing>', True),
        ('<pl-thing checked="false"></pl-thing>', True),
        ('<pl-thing checked="checked"></pl-thing>', True),
        ('<pl-thing checked=""></pl-thing>', True),
        ("<pl-thing checked></pl-thing>", True),
        ("<pl-thing></pl-thing>", False),
    ],
)
def test_get_boolean_attrib_libxml(html_str: str, expected_result: bool | None) -> None:  # noqa: FBT001
    """Test that using HTML boolean attributes is only valid when reading as boolean with default False."""
    element = lxml.html.fragment_fromstring(html_str)
    result = pl.get_boolean_attrib(element, "checked", False)  # noqa: FBT003
    assert result == expected_result
    if not expected_result:
        expected_result = None
    result = pl.get_boolean_attrib(element, "checked")
    assert result == expected_result
    with pytest.raises(ValueError, match="boolean attribute"):
        pl.get_boolean_attrib(element, "checked", True)  # noqa: FBT003
    with pytest.raises(ValueError, match="boolean attribute"):
        pl.get_string_attrib(element, "checked", "")
    with pytest.raises(ValueError, match="boolean attribute"):
        pl.get_integer_attrib(element, "checked", 0)
    with pytest.raises(ValueError, match="boolean attribute"):
        pl.get_float_attrib(element, "checked", 0)
    with pytest.raises(ValueError, match="boolean attribute"):
        pl.get_color_attrib(element, "checked", "red1")
    with pytest.raises(ValueError, match="boolean attribute"):
        pl.get_enum_attrib(element, "checked", DummyEnum)


@pytest.mark.parametrize(
    ("html_str", "expected_result", "default"),
    [
        # Basic integer parsing
        ('<pl-thing int-val="42"></pl-thing>', 42, None),
        # Negative number
        ('<pl-thing int-val="-13"></pl-thing>', -13, None),
        # Default value cases
        ("<pl-thing></pl-thing>", 0, 0),
        ("<pl-thing></pl-thing>", None, None),
    ],
)
def test_get_integer_attrib(
    *, html_str: str, expected_result: int | None, default: int | None
) -> None:
    """Test integer attribute parsing."""
    element = lxml.html.fragment_fromstring(html_str)
    if default is None:
        # Test without default value
        if "int-val" in element.attrib:
            result = pl.get_integer_attrib(element, "int-val")
            assert result == expected_result
        else:
            with pytest.raises(ValueError, match="missing and no default is available"):
                pl.get_integer_attrib(element, "int-val")
    else:
        # Test with default value
        result = pl.get_integer_attrib(element, "int-val", default)
        assert result == expected_result


@pytest.mark.parametrize(
    "html_str",
    [
        '<pl-thing int-val="3.14"></pl-thing>',
        '<pl-thing int-val="not-a-number"></pl-thing>',
        '<pl-thing int-val=""></pl-thing>',
    ],
)
def test_get_integer_attrib_invalid(html_str: str) -> None:
    """Test that invalid integer values raise ValueError."""
    element = lxml.html.fragment_fromstring(html_str)
    with pytest.raises(ValueError, match="must be an integer"):
        pl.get_integer_attrib(element, "int-val")


@pytest.mark.parametrize(
    ("html_str", "expected_result", "default"),
    [
        # Basic float parsing
        ('<pl-thing float-val="5.5"></pl-thing>', 5.5, None),
        # Scientific notation
        ('<pl-thing float-val="-1.2e-3"></pl-thing>', -0.0012, None),
        # Special values
        ('<pl-thing float-val="-inf"></pl-thing>', float("-inf"), None),
        ('<pl-thing float-val="nan"></pl-thing>', float("nan"), None),
        # Default value cases
        ("<pl-thing></pl-thing>", 0.0, 0.0),
        ("<pl-thing></pl-thing>", None, None),
    ],
)
def test_get_float_attrib(
    *, html_str: str, expected_result: float | None, default: float | None
) -> None:
    """Test float attribute parsing."""
    element = lxml.html.fragment_fromstring(html_str)
    if default is None:
        # Test without default value
        if "float-val" in element.attrib:
            result = pl.get_float_attrib(element, "float-val")
            if expected_result is not None and np.isnan(expected_result):
                assert np.isnan(result)
            else:
                assert result == expected_result
        else:
            with pytest.raises(ValueError, match="missing and no default is available"):
                pl.get_float_attrib(element, "float-val")
    else:
        # Test with default value
        result = pl.get_float_attrib(element, "float-val", default)
        assert result == expected_result


@pytest.mark.parametrize(
    "html_str",
    [
        '<pl-thing float-val="not-a-number"></pl-thing>',
        '<pl-thing float-val=""></pl-thing>',
        '<pl-thing float-val="3+4"></pl-thing>',
    ],
)
def test_get_float_attrib_invalid(html_str: str) -> None:
    """Test that invalid float values raise ValueError."""
    element = lxml.html.fragment_fromstring(html_str)
    with pytest.raises(ValueError, match="must be a number"):
        pl.get_float_attrib(element, "float-val")


@pytest.mark.parametrize(
    ("html_str", "expected_result", "default"),
    [
        # Hex color formats
        ('<pl-thing color-val="#123"></pl-thing>', "#123", None),
        ('<pl-thing color-val="#1a2b3c"></pl-thing>', "#1a2b3c", None),
        # Named colors
        ('<pl-thing color-val="red"></pl-thing>', "#ff0000", None),
        # Default value cases
        ("<pl-thing></pl-thing>", "#000000", "#000000"),
        ("<pl-thing></pl-thing>", None, None),
    ],
)
def test_get_color_attrib(
    *, html_str: str, expected_result: str | None, default: str | None
) -> None:
    """Test color attribute parsing with various formats and defaults."""
    element = lxml.html.fragment_fromstring(html_str)
    if default is None:
        # Test without default value
        if "color-val" in element.attrib:
            result = pl.get_color_attrib(element, "color-val")
            assert result == expected_result
        else:
            with pytest.raises(ValueError, match="missing and no default is available"):
                pl.get_color_attrib(element, "color-val")
    else:
        # Test with default value
        result = pl.get_color_attrib(element, "color-val", default)
        assert result == expected_result


@pytest.mark.parametrize(
    "html_str",
    [
        '<pl-thing color-val="not-a-color"></pl-thing>',
        '<pl-thing color-val="#xyz"></pl-thing>',
        '<pl-thing color-val="#12"></pl-thing>',
        '<pl-thing color-val=""></pl-thing>',
    ],
)
def test_get_color_attrib_invalid(html_str: str) -> None:
    """Test that invalid color values raise ValueError."""
    element = lxml.html.fragment_fromstring(html_str)
    with pytest.raises(ValueError, match="must be a CSS-style RGB string"):
        pl.get_color_attrib(element, "color-val")


@pytest.mark.parametrize(
    (
        "input_str",
        "allow_fractions",
        "allow_complex",
        "expected_value",
        "expected_data",
    ),
    [
        # Basic fractions
        ("1/2", True, False, 0.5, {"submitted_answers": 0.5}),
        # Basic decimals
        ("0.25", True, False, 0.25, {"submitted_answers": 0.25}),
        # Complex numbers
        (
            "1+2j",
            True,
            True,
            1 + 2j,
            {
                "submitted_answers": {
                    "_type": "complex",
                    "_value": {"real": 1.0, "imag": 2.0},
                }
            },
        ),
        # Error cases
        ("", True, False, None, {"format_errors": "The submitted answer was blank."}),
        (
            "invalid",
            True,
            False,
            None,
            {
                "format_errors": "Invalid format: The submitted answer could not be interpreted as a decimal number."
            },
        ),
        (
            "1/2",
            False,
            False,
            None,
            {"format_errors": "Fractional answers are not allowed in this input."},
        ),
        (
            "1/0",
            True,
            False,
            None,
            {"format_errors": "Your expression resulted in a division by zero."},
        ),
    ],
)
def test_string_fraction_to_number(
    *,
    input_str: str | None,
    allow_fractions: bool,
    allow_complex: bool,
    expected_value: complex | None,
    expected_data: dict[str, Any],
) -> None:
    """Test parsing strings into numbers, with support for fractions."""
    value, data = pl.string_fraction_to_number(
        input_str, allow_fractions, allow_complex
    )

    if expected_value is None:
        assert value is None
    else:
        assert value == pytest.approx(expected_value)
    assert len(data) == 1  # Should only contain one key
    assert next(iter(data.keys())) in ["submitted_answers", "format_errors"]
    if "submitted_answers" in data:
        submitted = pl.from_json(data["submitted_answers"])
        assert submitted == pytest.approx(expected_value)
    else:
        assert data == expected_data


@pytest.mark.parametrize(
    ("submitted", "true", "digits", "expected"),
    [
        # Basic array equality
        (
            np.array([[1.0, 2.0], [3.0, 4.0]]),
            np.array([[1.0, 2.0], [3.0, 4.0]]),
            2,
            True,
        ),
        # Within tolerance (2 decimal places = +/- 0.005)
        (
            np.array([[1.001, 2.005], [3.008, 4.009]]),
            np.array([[1.005, 2.000], [3.004, 4.014]]),
            2,
            True,
        ),
        # Outside tolerance
        (
            np.array([[1.01, 2.0], [3.0, 4.0]]),
            np.array([[1.00, 2.0], [3.0, 4.0]]),
            2,
            False,
        ),
        # Complex numbers
        (
            np.array([[1 + 1j, 2 + 2j], [3 + 3j, 4 + 4j]]),
            np.array([[1 + 1j, 2 + 2j], [3 + 3j, 4 + 4j]]),
            2,
            True,
        ),
    ],
)
def test_is_correct_ndarray2d_dd(
    *,
    submitted: np.ndarray[Any, Any],
    true: np.ndarray[Any, Any],
    digits: int,
    expected: bool,
) -> None:
    """Test arrays are equal within decimal digit tolerance."""
    assert pl.is_correct_ndarray2d_dd(submitted, true, digits) == expected


@pytest.mark.parametrize(
    ("submitted", "true", "digits", "expected"),
    [
        # Basic array equality
        (
            np.array([[1.0, np.inf], [3.0, np.nan]]),
            np.array([[1.0, np.inf], [3.0, np.nan]]),
            2,
            True,
        ),
        # Within tolerance (2 significant figures)
        (
            np.array([[0.095, 2.0], [3.0, 4.0]]),
            np.array([[0.100, 2.0], [3.0, 4.0]]),
            2,
            True,
        ),
        # Outside tolerance
        (
            np.array([[0.094, 2.0], [3.0, 4.0]]),
            np.array([[0.100, 2.0], [3.0, 4.0]]),
            2,
            False,
        ),
        # Complex numbers
        (
            np.array([[1 + 1j, 2 + 2j], [3 + 3j, 4 + 4j]]),
            np.array([[1 + 1j, 2 + 2j], [3 + 3j, 4 + 4j]]),
            2,
            True,
        ),
        (
            np.array([[1 + 0.094j, 2 + 2j], [3 + 3j, 4 + 4j]]),
            np.array([[1 + 1j, 2 + 2j], [3 + 3j, 4 + 4j]]),
            2,
            False,
        ),
    ],
)
def test_is_correct_ndarray2d_sf(
    *,
    submitted: np.ndarray[Any, Any],
    true: np.ndarray[Any, Any],
    digits: int,
    expected: bool,
) -> None:
    """Test arrays are equal within significant figure tolerance."""
    assert pl.is_correct_ndarray2d_sf(submitted, true, digits) == expected


def test_load_extension() -> None:
    """Test loading extensions with the load_extension function."""
    director = Path(__file__).parent
    controller = "dummy_extension.py"

    # Create mock data with extension info
    data: pl.QuestionData = {
        "extensions": {
            "dummy": {
                "directory": director,
                "controller": controller,
            }
        },
        # Fill required fields with empty values
        "params": {},
        "correct_answers": {},
        "submitted_answers": {},
        "format_errors": {},
        "partial_scores": {},
        "score": 0,
        "feedback": {},
        "variant_seed": "",
        "options": {},
        "raw_submitted_answers": {},
        "editable": True,
        "panel": "question",
        "num_valid_submissions": 0,
        "manual_grading": False,
        "ai_grading": False,
        "answers_names": {},
    }

    # Test successful loading
    ext = pl.load_extension(data, "dummy")
    assert ext.sample_function() == "Hello from dummy extension"
    assert ext.SAMPLE_CONSTANT == 42
    with pytest.raises(AttributeError):
        _ = ext.__python_internal__

    # Test loading non-existent extension
    with pytest.raises(ValueError, match="Could not find extension"):
        pl.load_extension(data, "nonexistent")

    # Test loading all extensions
    exts = pl.load_all_extensions(data)
    assert len(exts) == 1
    assert "dummy" in exts
    assert exts["dummy"].sample_function() == "Hello from dummy extension"
    assert exts["dummy"].SAMPLE_CONSTANT == 42
    with pytest.raises(AttributeError):
        _ = exts["dummy"].__python_internal__


def test_add_files_format_error(question_data: pl.QuestionData) -> None:
    """Test basic functionality of add_files_format_error."""
    # Test adding first error
    pl.add_files_format_error(question_data, "Error 1")
    assert question_data["format_errors"]["_files"] == ["Error 1"]

    # Test adding second error
    pl.add_files_format_error(question_data, "Error 2")
    assert question_data["format_errors"]["_files"] == ["Error 1", "Error 2"]

    # Test handling non-list _files value
    question_data["format_errors"]["_files"] = "not a list"
    pl.add_files_format_error(question_data, "Error 3")
    assert question_data["format_errors"]["_files"] == [
        '"_files" was present in "format_errors" but was not an array',
        "Error 3",
    ]


def test_check_attribs() -> None:
    """Test checking required and optional attributes."""
    element = lxml.html.fragment_fromstring(
        '<pl-test required-attr="val" optional-attr="val"></pl-test>'
    )

    # Should pass with correct attributes
    pl.check_attribs(element, ["required-attr"], ["optional-attr"])

    # Should fail if required attribute missing
    with pytest.raises(ValueError, match='Required attribute "missing-attr" missing'):
        pl.check_attribs(element, ["missing-attr"], ["optional-attr"])


@pytest.mark.parametrize(
    ("element_str", "expected_result", "default"),
    [
        # Empty and whitespace
        ('<pl-test str-attr=""></pl-test>', "", None),
        ('<pl-test str-attr="   "></pl-test>', "   ", None),
        # Special characters
        ('<pl-test str-attr="hello&quot;world"></pl-test>', 'hello"world', None),
        # Unicode
        ('<pl-test str-attr="こんにちは"></pl-test>', "こんにちは", None),
        # '<pl-test str-attr="value"></pl-test>'
        ('<pl-test str-attr="value"></pl-test>', "value", None),
        # Default value cases
        ("<pl-test></pl-test>", "default", "default"),
        ("<pl-test></pl-test>", None, None),
    ],
)
def test_get_string_attrib(
    *, element_str: str, expected_result: str, default: str | None
) -> None:
    """Test edge cases for string attribute retrieval."""
    element = lxml.html.fragment_fromstring(element_str)
    if default is None and "str-attr" not in element.attrib:
        with pytest.raises(ValueError, match='Attribute "str-attr" missing'):
            pl.get_string_attrib(element, "str-attr")
    else:
        result = pl.get_string_attrib(element, "str-attr", default)
        assert result == expected_result


def test_string_to_integer() -> None:
    """Test converting strings to integers."""
    # Basic integer parsing
    assert pl.string_to_integer("42") == 42
    assert pl.string_to_integer("3.14") is None
    assert pl.string_to_integer("not a number") is None


def test_load_host_script() -> None:
    """Test loading host scripts."""
    # Test loading dummy_extension.py
    script = pl.load_host_script("dummy_extension")

    # Verify the loaded module has expected attributes
    assert script.sample_function() == "Hello from dummy extension"
    assert script.SAMPLE_CONSTANT == 42


def test_add_submitted_file(question_data: pl.QuestionData) -> None:
    """Test adding submitted files to question data."""
    # Test adding first file
    base64_msg1 = base64.b64encode(b"msg1").decode("utf-8")
    base64_msg2 = base64.b64encode(b"msg2").decode("utf-8")
    base64_msg3 = base64.b64encode(b"msg3").decode("utf-8")
    pl.add_submitted_file(question_data, "test1.txt", base64_msg1)
    assert question_data["submitted_answers"]["_files"] == [
        {"name": "test1.txt", "contents": base64_msg1}
    ]

    # Test adding second file
    pl.add_submitted_file(question_data, "test2.txt", base64_msg2)
    assert question_data["submitted_answers"]["_files"] == [
        {"name": "test1.txt", "contents": base64_msg1},
        {"name": "test2.txt", "contents": base64_msg2},
    ]

    # Test adding third file with raw content
    pl.add_submitted_file(question_data, "test3.txt", raw_contents="msg3")
    assert question_data["submitted_answers"]["_files"] == [
        {"name": "test1.txt", "contents": base64_msg1},
        {"name": "test2.txt", "contents": base64_msg2},
        {"name": "test3.txt", "contents": base64_msg3},
    ]

    # Test adding fourth file with no content
    with pytest.raises(ValueError, match="No content provided for file"):
        pl.add_submitted_file(question_data, "test4.txt")
    assert question_data["submitted_answers"]["_files"] == [
        {"name": "test1.txt", "contents": base64_msg1},
        {"name": "test2.txt", "contents": base64_msg2},
        {"name": "test3.txt", "contents": base64_msg3},
    ]


@pytest.mark.parametrize(
    ("answers_names", "name", "should_raise"),
    [
        ({"x": None, "y": None}, "z", False),
        ({"x": None, "y": None}, "x", True),
        ({}, "y", False),
    ],
)
def test_check_answers_names(
    *,
    answers_names: dict[str, Any],
    name: str,
    should_raise: bool,
) -> None:
    """Test checking answer name validation."""
    question_data = cast(pl.QuestionData, {"answers_names": answers_names})
    if should_raise:
        with pytest.raises(KeyError):
            pl.check_answers_names(question_data, name)
    else:
        # Should not raise an exception
        pl.check_answers_names(question_data, name)


def test_partition() -> None:
    nums = [1, 2, 3, 4, 6, 5]
    evens, odds = pl.partition(nums, lambda x: x % 2 == 0)
    assert odds == [1, 3, 5]
    assert evens == [2, 4, 6]
