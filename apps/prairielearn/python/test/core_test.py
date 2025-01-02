import itertools as it
import json
import math
import string
from enum import Enum
from typing import Any, Callable, cast

import lxml.html
import networkx as nx
import numpy as np
import pandas as pd
import prairielearn as pl
import pytest


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
    return pd.DataFrame(
        {
            # Scalars
            "integer": 1,
            "numeric": 3.14,
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
        }
    )


@pytest.mark.parametrize(
    "df",
    [city_dataframe(), breast_cancer_dataframe(), r_types_dataframe()],
)
def test_encoding_pandas(df: pd.DataFrame) -> None:
    """Test that new json encoding works"""

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
def test_networkx_serialization(networkx_graph: Any) -> None:
    """Test equality after conversion of various numpy objects."""

    networkx_graph.graph["rankdir"] = "TB"

    # Add some data to test that it's retained
    for i, (in_node, out_node, edge_data) in enumerate(networkx_graph.edges(data=True)):
        edge_data["weight"] = i
        edge_data["label"] = chr(ord("a") + i)

    json_object = json.dumps(pl.to_json(networkx_graph), allow_nan=False)
    decoded_json_object = pl.from_json(json.loads(json_object))

    assert type(networkx_graph) == type(decoded_json_object)  # noqa: E721

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
    "weight_set_function, score_1, score_2, score_3, expected_score",
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
def test_numpy_serialization(numpy_object: Any) -> None:
    """Test equality after conversion of various numpy objects."""

    json_object = json.dumps(
        pl.to_json(numpy_object, np_encoding_version=2), allow_nan=False
    )
    decoded_json_object = pl.from_json(json.loads(json_object))

    assert type(numpy_object) == type(decoded_json_object)  # noqa: E721
    np.testing.assert_array_equal(numpy_object, decoded_json_object, strict=True)


@pytest.mark.parametrize(
    "object_to_encode, expected_result",
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
    "html_str, expected_result",
    [
        ("<pl-thing></pl-thing>", DummyEnum.DEFAULT),
        ('<pl-thing test-choice="default"></pl-thing>', DummyEnum.DEFAULT),
        (
            '<pl-thing test-choice="dummy-choice-1"></pl-thing>',
            DummyEnum.DUMMY_CHOICE_1,
        ),
        (
            '<pl-thing test-choice="dummy-choice-2"></pl-thing>',
            DummyEnum.DUMMY_CHOICE_2,
        ),
        (
            '<pl-thing test-choice="dummy-choice-3"></pl-thing>',
            DummyEnum.DUMMY_CHOICE_3,
        ),
    ],
)
def test_get_enum_attrib(html_str: str, expected_result: DummyEnum) -> None:
    element = lxml.html.fragment_fromstring(html_str)
    result = pl.get_enum_attrib(element, "test-choice", DummyEnum, DummyEnum.DEFAULT)

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

    with pytest.raises(Exception):
        pl.get_enum_attrib(element, "test-choice", DummyEnum)


@pytest.mark.parametrize(
    "question_name, student_answer, weight, expected_grade",
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
    expected_grade: bool,
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
        decoy_dict: dict[str, str] = dict()
        decoy_dict["junk"]  # This is to throw a key error
        return (True, None)

    with pytest.raises(KeyError):
        pl.grade_answer_parameterized(question_data, question_name, grading_function)

    # Empty out submitted answers
    question_data["submitted_answers"] = dict()
    question_data["format_errors"] = dict()
    pl.grade_answer_parameterized(question_data, question_name, grading_function)

    assert question_data["partial_scores"][question_name]["score"] == 0.0


@pytest.mark.repeat(100)
def test_get_uuid() -> None:
    """Test basic properties of the pl.get_uuid() function."""

    pl_uuid = pl.get_uuid()
    clauses = pl_uuid.split("-")

    # Assert clauses have standard structure.
    assert len(clauses) == 5
    assert [8, 4, 4, 4, 12] == list(map(len, clauses))

    # Assert that all characters are valid.
    seen_characters = set().union(*(clause for clause in clauses))
    allowed_hex_characters = set(string.hexdigits[:16])
    assert seen_characters.issubset(allowed_hex_characters)

    # Assert that the first character is a valid hex letter.
    assert pl_uuid[0] in set("abcdef")


@pytest.mark.parametrize(
    "length, expected_output",
    [
        (1, ["a"]),
        (2, ["a", "b"]),
        (4, ["a", "b", "c", "d"]),
    ],
)
def test_iter_keys(length: int, expected_output: list[str]) -> None:
    assert list(it.islice(pl.iter_keys(), length)) == expected_output


@pytest.mark.parametrize(
    "idx, expected_output",
    [(0, "a"), (1, "b"), (3, "d"), (26, "aa"), (27, "ab")],
)
def test_index2key(idx: int, expected_output: str) -> None:
    assert pl.index2key(idx) == expected_output
