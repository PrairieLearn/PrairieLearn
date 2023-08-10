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
from pytest_lazyfixture import lazy_fixture


@pytest.mark.parametrize(
    "df",
    lazy_fixture(["city_dataframe", "breast_cancer_dataframe", "r_types_dataframe"]),
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
    lazy_fixture(["city_dataframe", "breast_cancer_dataframe", "r_types_dataframe"]),
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

    assert question_data["format_errors"][question_name] == "No answer was submitted"


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
