import json
import math
from enum import Enum
from typing import Any, Callable, Dict, Optional, Tuple, cast

import lxml.html
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

    assert type(json_str) == str

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


def test_inner_html() -> None:
    e = lxml.html.fragment_fromstring("<div>test</div>")
    assert pl.inner_html(e) == "test"

    e = lxml.html.fragment_fromstring("<div>test&gt;test</div>")
    assert pl.inner_html(e) == "test&gt;test"


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

    def grading_function(submitted_answer: str) -> Tuple[bool, Optional[str]]:
        if submitted_answer in {"a", "b", "c", "d", "<>"}:
            return True, good_feedback
        return False, bad_feedback

    pl.grade_answer_parameterized(
        question_data, question_name, grading_function, weight
    )

    expected_score = 1.0 if expected_grade else 0.0
    assert question_data["partial_scores"][question_name]["score"] == expected_score
    assert type(question_data["partial_scores"][question_name]["score"]) == float

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

    def grading_function(_: str) -> Tuple[bool, Optional[str]]:
        decoy_dict: Dict[str, str] = dict()
        decoy_dict["junk"]  # This is to throw a key error
        return (True, None)

    with pytest.raises(KeyError):
        pl.grade_answer_parameterized(question_data, question_name, grading_function)

    # Empty out submitted answers
    question_data["submitted_answers"] = dict()
    question_data["format_errors"] = dict()
    pl.grade_answer_parameterized(question_data, question_name, grading_function)

    assert question_data["format_errors"][question_name] == "No answer was submitted"


class TestEnum(Enum):
    DEFAULT = 0
    TEST_CHOICE_1 = 1
    TEST_CHOICE_2 = 2
    TEST_CHOICE_3 = 3


@pytest.mark.parametrize(
    "html_str, expected_result",
    [
        ("<pl-thing></pl-thing>", TestEnum.DEFAULT),
        ('<pl-thing test-choice="default"></pl-thing>', TestEnum.DEFAULT),
        ('<pl-thing test-choice="test-choice-1"></pl-thing>', TestEnum.TEST_CHOICE_1),
        ('<pl-thing test-choice="test-choice-2"></pl-thing>', TestEnum.TEST_CHOICE_2),
        ('<pl-thing test-choice="test-choice-3"></pl-thing>', TestEnum.TEST_CHOICE_3),
    ],
)
def test_get_enum_attrib(html_str: str, expected_result: TestEnum) -> None:
    element = lxml.html.fragment_fromstring(html_str)
    result = pl.get_enum_attrib(element, "test-choice", TestEnum, TestEnum.DEFAULT)

    assert result is expected_result


@pytest.mark.parametrize(
    "html_str",
    [
        "<pl-thing></pl-thing>",
        '<pl-thing test-choice="DEFAULT"></pl-thing>',
        '<pl-thing test-choice="Default"></pl-thing>',
        '<pl-thing test-choice="test_choice_1"></pl-thing>',
    ],
)
def test_get_enum_attrib_exceptions(html_str: str) -> None:
    element = lxml.html.fragment_fromstring(html_str)

    with pytest.raises(Exception):
        pl.get_enum_attrib(element, "test-choice", TestEnum)
